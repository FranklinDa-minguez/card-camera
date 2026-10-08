import ExpoModulesCore

public class CardTrackerModule: Module {
  public func definition() -> ModuleDefinition {
    Name("CardTracker")

    View(CardTrackerView.self) {
      Prop("cardImageUri") { (view: CardTrackerView, uri: String?) in
        view.setCardImage(uri)
      }

      Prop("overlayVisible") { (view: CardTrackerView, visible: Bool) in
        view.setOverlayVisible(visible)
      }

      Prop("facing") { (view: CardTrackerView, facing: String) in
        view.setFacing(facing)
      }

      Prop("zoom") { (view: CardTrackerView, zoom: Double) in
        view.setZoom(zoom)
      }

      AsyncFunction("takePhoto") { (view: CardTrackerView) -> String? in
        view.takePhoto()
      }
    }
  }
}
