Pod::Spec.new do |s|
  s.name           = 'CardTracker'
  s.version        = '1.0.0'
  s.summary        = 'Tracks a playing card in the camera feed and overlays a replacement'
  s.description    = 'Live camera view that detects a card with Vision and composites a matching card over it'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'AVFoundation', 'CoreImage', 'Metal', 'Vision'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
