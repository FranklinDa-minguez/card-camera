import AVFoundation
import CoreImage
import CoreImage.CIFilterBuiltins
import ExpoModulesCore
import Metal
import QuartzCore
import UIKit
import Vision

/// A live camera view that finds a playing card in each frame and draws a replacement
/// card over it: same corners (position, size, angle, perspective) and the same lighting.
/// The camera frame and the overlay are composited into one image, so they never drift apart.
class CardTrackerView: ExpoView, AVCaptureVideoDataOutputSampleBufferDelegate {
  // MARK: Rendering

  private let metalLayer = CAMetalLayer()
  private let device = MTLCreateSystemDefaultDevice()
  private lazy var commandQueue = device?.makeCommandQueue()
  private lazy var ciContext: CIContext = {
    if let device { return CIContext(mtlDevice: device, options: [.cacheIntermediates: false]) }
    return CIContext()
  }()
  private let outputColorSpace = CGColorSpace(name: CGColorSpace.sRGB)!

  // MARK: Capture

  private let session = AVCaptureSession()
  private let videoOutput = AVCaptureVideoDataOutput()
  private let sessionQueue = DispatchQueue(label: "cardtracker.session")
  private let videoQueue = DispatchQueue(label: "cardtracker.video", qos: .userInteractive)
  private var currentInput: AVCaptureDeviceInput?

  // MARK: Settings shared between the main thread and the video queue (guarded by `lock`)

  private let lock = NSLock()
  private var _cardImage: CIImage?
  private var _cardWhite: SIMD3<Float> = SIMD3(repeating: 0.98)
  private var _overlayVisible = true
  private var _mirrored = true
  private var _drawableSize = CGSize.zero
  private var _lastFrame: CIImage?

  private var facing: AVCaptureDevice.Position = .front
  private var zoom: Double = 0

  // MARK: Tracking state (video queue only)

  private var quad: Quad?
  private var framesSinceSeen = Int.max
  private var trackAlpha: CGFloat = 0
  private var overlayAlpha: CGFloat = 1
  private var gain = SIMD3<Float>(repeating: 1)
  private var shade = SIMD4<Float>(repeating: 1) // left, right, top, bottom relative brightness
  private var frameIndex = 0

  /// Frames the overlay keeps its last position after the card is lost (covers brief misses).
  private let holdFrames = 12

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    backgroundColor = .black
    metalLayer.device = device
    metalLayer.pixelFormat = .bgra8Unorm
    metalLayer.framebufferOnly = false
    metalLayer.contentsScale = UIScreen.main.scale
    layer.addSublayer(metalLayer)
    sessionQueue.async { self.configureSession() }
  }

  deinit {
    let session = self.session
    sessionQueue.async { session.stopRunning() }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    metalLayer.frame = bounds
    let size = CGSize(width: bounds.width * metalLayer.contentsScale, height: bounds.height * metalLayer.contentsScale)
    metalLayer.drawableSize = size
    lock.withLock { _drawableSize = size }
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    let attached = window != nil
    sessionQueue.async {
      if attached, !self.session.isRunning {
        self.session.startRunning()
      } else if !attached, self.session.isRunning {
        self.session.stopRunning()
      }
    }
  }

  // MARK: Props

  func setCardImage(_ uri: String?) {
    guard let uri, let url = URL(string: uri), var image = CIImage(contentsOf: url) else {
      lock.withLock { _cardImage = nil }
      return
    }
    // Pad with transparent pixels so the warped edges are antialiased instead of jagged.
    image = image.transformed(by: CGAffineTransform(translationX: -image.extent.minX, y: -image.extent.minY))
    let padded = image.composited(over: CIImage(color: .clear).cropped(to: image.extent.insetBy(dx: -3, dy: -3)))
      .transformed(by: CGAffineTransform(translationX: 3, y: 3))
    let white = edgeBrightness(of: padded.cropped(to: padded.extent.insetBy(dx: 3, dy: 3))).average
    lock.withLock {
      _cardImage = padded
      _cardWhite = white
    }
  }

  func setOverlayVisible(_ visible: Bool) {
    lock.withLock { _overlayVisible = visible }
  }

  func setFacing(_ value: String) {
    let position: AVCaptureDevice.Position = value == "back" ? .back : .front
    sessionQueue.async {
      guard position != self.facing else { return }
      self.facing = position
      self.configureSession()
    }
  }

  func setZoom(_ value: Double) {
    sessionQueue.async {
      self.zoom = value
      self.applyZoom()
    }
  }

  /// Saves exactly what the viewfinder shows (including the overlay) as a JPEG.
  func takePhoto() -> String? {
    let (frame, drawable) = lock.withLock { (_lastFrame, _drawableSize) }
    guard let frame else { return nil }
    let cropped = frame.cropped(to: aspectFillCrop(of: frame.extent, to: drawable))
    guard let data = ciContext.jpegRepresentation(of: cropped, colorSpace: outputColorSpace, options: [:]) else {
      return nil
    }
    let url = FileManager.default.temporaryDirectory.appendingPathComponent("\(UUID().uuidString).jpg")
    do {
      try data.write(to: url)
      return url.absoluteString
    } catch {
      return nil
    }
  }

  // MARK: Session setup (session queue)

  private func configureSession() {
    session.beginConfiguration()
    defer { session.commitConfiguration() }

    // The snap detector owns the audio session; the camera never needs the mic.
    session.automaticallyConfiguresApplicationAudioSession = false

    if let currentInput {
      session.removeInput(currentInput)
      self.currentInput = nil
    }
    guard
      let camera = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: facing),
      let input = try? AVCaptureDeviceInput(device: camera),
      session.canAddInput(input)
    else { return }
    session.addInput(input)
    currentInput = input

    session.sessionPreset = session.canSetSessionPreset(.hd1920x1080) ? .hd1920x1080 : .high

    if !session.outputs.contains(videoOutput), session.canAddOutput(videoOutput) {
      videoOutput.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
      videoOutput.alwaysDiscardsLateVideoFrames = true
      videoOutput.setSampleBufferDelegate(self, queue: videoQueue)
      session.addOutput(videoOutput)
    }

    // Deliver upright portrait frames, mirrored for the front camera like the real Camera app,
    // so Vision and Core Image can work in plain image coordinates.
    if let connection = videoOutput.connection(with: .video) {
      if #available(iOS 17.0, *) {
        if connection.isVideoRotationAngleSupported(90) { connection.videoRotationAngle = 90 }
      } else if connection.isVideoOrientationSupported {
        connection.videoOrientation = .portrait
      }
      if connection.isVideoMirroringSupported {
        connection.automaticallyAdjustsVideoMirroring = false
        connection.isVideoMirrored = facing == .front
      }
    }
    lock.withLock { _mirrored = facing == .front }
    videoQueue.async { self.quad = nil }
    applyZoom()
  }

  private func applyZoom() {
    guard let camera = currentInput?.device, (try? camera.lockForConfiguration()) != nil else { return }
    // `zoom` is 0...1 like expo-camera; map it to a sensible 1x...5x range.
    let factor = CGFloat(1 + max(0, min(1, zoom)) * 4)
    camera.videoZoomFactor = max(camera.minAvailableVideoZoomFactor, min(factor, camera.maxAvailableVideoZoomFactor))
    camera.unlockForConfiguration()
  }

  // MARK: Per-frame processing (video queue)

  func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
    guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
    let frame = CIImage(cvPixelBuffer: pixelBuffer)
    frameIndex += 1

    let (card, cardWhite, visible, mirrored, drawableSize) = lock.withLock {
      (_cardImage, _cardWhite, _overlayVisible, _mirrored, _drawableSize)
    }

    updateTracking(pixelBuffer: pixelBuffer, frameSize: frame.extent.size)

    // Fade the overlay in/out: on snap (visible = false) and when the card is lost for a while.
    overlayAlpha = approach(overlayAlpha, visible ? 1 : 0, step: 0.25)
    trackAlpha = approach(trackAlpha, framesSinceSeen <= holdFrames ? 1 : 0, step: 0.2)
    let alpha = overlayAlpha * trackAlpha

    var output = frame
    if let card, let quad, alpha > 0.01 {
      if frameIndex % 2 == 0 { updateLighting(frame: frame, quad: quad, cardWhite: cardWhite) }
      output = overlay(card: card, on: frame, quad: quad, mirrored: mirrored, alpha: alpha)
    }

    lock.withLock { _lastFrame = output }
    render(output, drawableSize: drawableSize)
  }

  private func updateTracking(pixelBuffer: CVPixelBuffer, frameSize: CGSize) {
    let request = VNDetectRectanglesRequest()
    request.minimumAspectRatio = 0.55 // a poker card is 2.5 / 3.5 ≈ 0.71
    request.maximumAspectRatio = 0.85
    request.quadratureTolerance = 30
    request.minimumSize = 0.08
    request.minimumConfidence = 0.5
    request.maximumObservations = 3

    let handler = VNImageRequestHandler(cvPixelBuffer: pixelBuffer, orientation: .up, options: [:])
    try? handler.perform([request])

    let found = (request.results ?? []).map { Quad(observation: $0, size: frameSize) }
    // Prefer the rectangle closest to where the card was last frame.
    let best: Quad?
    if let previous = quad {
      best = found.min { $0.center.distance(to: previous.center) < $1.center.distance(to: previous.center) }
    } else {
      best = found.max { $0.area < $1.area }
    }

    guard let best else {
      if framesSinceSeen < Int.max { framesSinceSeen += 1 }
      return
    }
    if let previous = quad, framesSinceSeen <= holdFrames, best.center.distance(to: previous.center) < previous.size * 0.5 {
      // Light smoothing removes jitter without making the overlay lag behind the card.
      quad = previous.blended(toward: best, amount: 0.65)
    } else {
      quad = best
    }
    framesSinceSeen = 0
  }

  /// Measures the real card's white border and derives per-channel gains + a lighting gradient.
  private func updateLighting(frame: CIImage, quad: Quad, cardWhite: SIMD3<Float>) {
    let flattened = frame.applyingFilter("CIPerspectiveCorrection", parameters: [
      "inputTopLeft": CIVector(cgPoint: quad.topLeft),
      "inputTopRight": CIVector(cgPoint: quad.topRight),
      "inputBottomLeft": CIVector(cgPoint: quad.bottomLeft),
      "inputBottomRight": CIVector(cgPoint: quad.bottomRight),
    ])
    let edges = edgeBrightness(of: flattened)
    // Fingers can cover an edge, so trust the three brightest edges.
    let bands = [edges.left, edges.right, edges.top, edges.bottom].sorted { $0.sum > $1.sum }
    let paper = (bands[0] + bands[1] + bands[2]) / 3
    let target = (paper / pointwiseMax(cardWhite, SIMD3(repeating: 0.01)))
      .clamped(lowerBound: SIMD3(repeating: 0.03), upperBound: SIMD3(repeating: 1.4))
    gain = gain + (target - gain) * 0.35

    let mean = max(0.001, paper.sum / 3)
    func rel(_ v: SIMD3<Float>) -> Float { min(1.3, max(0.6, (v.sum / 3) / mean)) }
    let targetShade = SIMD4(rel(edges.left), rel(edges.right), rel(edges.top), rel(edges.bottom))
    shade = shade + (targetShade - shade) * 0.35
  }

  private func overlay(card: CIImage, on frame: CIImage, quad: Quad, mirrored: Bool, alpha: CGFloat) -> CIImage {
    var face = card
    // The front camera preview is mirrored, so a real card's printing reads backwards. Match it.
    if mirrored {
      face = face.transformed(by: CGAffineTransform(scaleX: -1, y: 1).translatedBy(x: -face.extent.width, y: 0))
    }

    // Which measured edge of the real card each edge of the face lands on (see the warp below).
    let q = quad.expanded(by: 1.035)
    let (faceLeft, faceRight, faceTop, faceBottom) = q.isLandscape
      ? (shade.z, shade.w, shade.y, shade.x)
      : (shade.x, shade.y, shade.z, shade.w)

    // Lighting: a soft brightness gradient across the card, normalised to <= 1 so the
    // gradient colours stay in range; the overall level is folded into the gains below.
    let hMax = max(faceLeft, faceRight), vMax = max(faceTop, faceBottom)
    func gray(_ v: Float) -> CIColor { CIColor(red: CGFloat(v), green: CGFloat(v), blue: CGFloat(v)) }
    let w = face.extent.width, h = face.extent.height
    let horizontal = CIFilter.linearGradient()
    horizontal.point0 = CGPoint(x: 0, y: h / 2)
    horizontal.point1 = CGPoint(x: w, y: h / 2)
    horizontal.color0 = gray(faceLeft / hMax)
    horizontal.color1 = gray(faceRight / hMax)
    let vertical = CIFilter.linearGradient()
    vertical.point0 = CGPoint(x: w / 2, y: h)
    vertical.point1 = CGPoint(x: w / 2, y: 0)
    vertical.color0 = gray(faceTop / vMax)
    vertical.color1 = gray(faceBottom / vMax)
    if let hg = horizontal.outputImage, let vg = vertical.outputImage {
      let lightMap = hg.applyingFilter("CIMultiplyCompositing", parameters: [kCIInputBackgroundImageKey: vg])
        .cropped(to: face.extent)
      // Multiply, then keep only the card's own shape (its rounded corners stay transparent).
      face = face.applyingFilter("CIMultiplyCompositing", parameters: [kCIInputBackgroundImageKey: lightMap])
        .applyingFilter("CISourceInCompositing", parameters: [kCIInputBackgroundImageKey: face])
        .cropped(to: face.extent)
    }

    let g = gain * (hMax * vMax)
    let matrix = CIFilter.colorMatrix()
    matrix.inputImage = face
    matrix.rVector = CIVector(x: CGFloat(g.x), y: 0, z: 0, w: 0)
    matrix.gVector = CIVector(x: 0, y: CGFloat(g.y), z: 0, w: 0)
    matrix.bVector = CIVector(x: 0, y: 0, z: CGFloat(g.z), w: 0)
    matrix.aVector = CIVector(x: 0, y: 0, z: 0, w: alpha)
    // Camera blacks are never pure black; lift them slightly with the scene's light.
    let lift = CGFloat(0.012) * CGFloat(gain.sum / 3)
    matrix.biasVector = CIVector(x: lift * alpha, y: lift * alpha, z: lift * alpha, w: 0)
    face = matrix.outputImage ?? face

    // Warp onto the card. A portrait card maps corner-to-corner; a sideways card is rotated a quarter turn.
    let corners = q.isLandscape
      ? (q.topRight, q.bottomRight, q.bottomLeft, q.topLeft)
      : (q.topLeft, q.topRight, q.bottomRight, q.bottomLeft)
    let warped = face.applyingFilter("CIPerspectiveTransform", parameters: [
      "inputTopLeft": CIVector(cgPoint: corners.0),
      "inputTopRight": CIVector(cgPoint: corners.1),
      "inputBottomRight": CIVector(cgPoint: corners.2),
      "inputBottomLeft": CIVector(cgPoint: corners.3),
    ])
    // Match the camera's softness.
    let softened = warped.clampedToExtent().applyingGaussianBlur(sigma: 0.7).cropped(to: warped.extent)
      .applyingFilter("CISourceInCompositing", parameters: [kCIInputBackgroundImageKey: warped])

    return softened.composited(over: frame).cropped(to: frame.extent)
  }

  private func render(_ image: CIImage, drawableSize: CGSize) {
    guard drawableSize.width > 0, let drawable = metalLayer.nextDrawable(), let buffer = commandQueue?.makeCommandBuffer() else { return }
    let target = CGSize(width: drawable.texture.width, height: drawable.texture.height)
    let crop = aspectFillCrop(of: image.extent, to: target)
    let scale = target.width / crop.width
    let fitted = image.cropped(to: crop)
      .transformed(by: CGAffineTransform(translationX: -crop.minX, y: -crop.minY).concatenating(CGAffineTransform(scaleX: scale, y: scale)))
    ciContext.render(fitted, to: drawable.texture, commandBuffer: buffer, bounds: CGRect(origin: .zero, size: target), colorSpace: outputColorSpace)
    buffer.present(drawable)
    buffer.commit()
  }

  // MARK: Helpers

  private struct EdgeBrightness {
    var left, right, top, bottom: SIMD3<Float>
    var average: SIMD3<Float> { (left + right + top + bottom) / 4 }
  }

  /// Average colour of thin strips just inside each edge of an upright card image
  /// (the plain white border, clear of the pips and corner indices).
  private func edgeBrightness(of image: CIImage) -> EdgeBrightness {
    let e = image.extent
    func strip(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat) -> SIMD3<Float> {
      averageColor(of: image, in: CGRect(x: e.minX + x * e.width, y: e.minY + y * e.height, width: w * e.width, height: h * e.height))
    }
    return EdgeBrightness(
      left: strip(0.04, 0.3, 0.08, 0.4),
      right: strip(0.88, 0.3, 0.08, 0.4),
      top: strip(0.3, 0.935, 0.4, 0.04),
      bottom: strip(0.3, 0.025, 0.4, 0.04)
    )
  }

  private func averageColor(of image: CIImage, in rect: CGRect) -> SIMD3<Float> {
    let filter = CIFilter.areaAverage()
    filter.inputImage = image
    filter.extent = rect
    guard let output = filter.outputImage else { return SIMD3(repeating: 1) }
    var pixel = [Float](repeating: 0, count: 4)
    ciContext.render(output, toBitmap: &pixel, rowBytes: 16, bounds: CGRect(x: output.extent.minX, y: output.extent.minY, width: 1, height: 1), format: .RGBAf, colorSpace: nil)
    return SIMD3(pixel[0], pixel[1], pixel[2])
  }

  private func aspectFillCrop(of extent: CGRect, to size: CGSize) -> CGRect {
    guard size.width > 0, size.height > 0 else { return extent }
    let targetAspect = size.width / size.height
    if extent.width / extent.height > targetAspect {
      let w = extent.height * targetAspect
      return CGRect(x: extent.midX - w / 2, y: extent.minY, width: w, height: extent.height)
    }
    let h = extent.width / targetAspect
    return CGRect(x: extent.minX, y: extent.midY - h / 2, width: extent.width, height: h)
  }

  private func approach(_ value: CGFloat, _ target: CGFloat, step: CGFloat) -> CGFloat {
    value < target ? min(target, value + step) : max(target, value - step)
  }
}

/// A card outline in image pixel coordinates (origin bottom-left, like Core Image and Vision).
private struct Quad {
  var topLeft, topRight, bottomRight, bottomLeft: CGPoint

  init(topLeft: CGPoint, topRight: CGPoint, bottomRight: CGPoint, bottomLeft: CGPoint) {
    self.topLeft = topLeft
    self.topRight = topRight
    self.bottomRight = bottomRight
    self.bottomLeft = bottomLeft
  }

  init(observation o: VNRectangleObservation, size: CGSize) {
    func p(_ n: CGPoint) -> CGPoint { CGPoint(x: n.x * size.width, y: n.y * size.height) }
    self.init(topLeft: p(o.topLeft), topRight: p(o.topRight), bottomRight: p(o.bottomRight), bottomLeft: p(o.bottomLeft))
  }

  var points: [CGPoint] { [topLeft, topRight, bottomRight, bottomLeft] }
  var center: CGPoint {
    CGPoint(x: points.map(\.x).reduce(0, +) / 4, y: points.map(\.y).reduce(0, +) / 4)
  }
  var size: CGFloat { max(topLeft.distance(to: bottomRight), topRight.distance(to: bottomLeft)) }
  var area: CGFloat { topLeft.distance(to: topRight) * topLeft.distance(to: bottomLeft) }
  var isLandscape: Bool {
    topLeft.distance(to: topRight) + bottomLeft.distance(to: bottomRight)
      > topLeft.distance(to: bottomLeft) + topRight.distance(to: bottomRight)
  }

  func blended(toward other: Quad, amount t: CGFloat) -> Quad {
    func mix(_ a: CGPoint, _ b: CGPoint) -> CGPoint { CGPoint(x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t) }
    return Quad(topLeft: mix(topLeft, other.topLeft), topRight: mix(topRight, other.topRight),
                bottomRight: mix(bottomRight, other.bottomRight), bottomLeft: mix(bottomLeft, other.bottomLeft))
  }

  /// Grows the outline slightly so the real card's edge never peeks out from under the overlay.
  func expanded(by factor: CGFloat) -> Quad {
    let c = center
    func grow(_ p: CGPoint) -> CGPoint { CGPoint(x: c.x + (p.x - c.x) * factor, y: c.y + (p.y - c.y) * factor) }
    return Quad(topLeft: grow(topLeft), topRight: grow(topRight), bottomRight: grow(bottomRight), bottomLeft: grow(bottomLeft))
  }
}

private extension CGPoint {
  func distance(to other: CGPoint) -> CGFloat { hypot(x - other.x, y - other.y) }
}

private extension SIMD3 where Scalar == Float {
  var sum: Float { x + y + z }
}
