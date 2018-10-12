{
  const { classes: Cc, interfaces: Ci, utils: Cu } = Components
  const { Services } = Cu.import("resource://gre/modules/Services.jsm", {})
  const ANCHOR_SUFFIX = "popupnotificationanchor"
  const ARCHOR_ID = "-notification-icon"
  const ID = "reader-mode-button"
  const POPUP_ID = "narrate-experiment-doorhanger"
  const PRIMARY_ACTION = "narrate-experiment-primary-action"
  const SECONDARY_ACTION = "narrate-experiment-secondary-action"

  const { ExtensionParent } = Cu.import(
    "resource://gre/modules/ExtensionParent.jsm",
    {}
  )
  const { windowTracker } = ExtensionParent.apiManager.global

  class NarrateActor {
    static spawn(config) {
      const self = new this(config)
      self.init()
      return self
    }
    constructor(config) {
      this.config = config
      this.onOpenWindow = this.onOpenWindow.bind(this)
    }
    init() {
      if (this.config.popup) {
        Services.mm.addMessageListener("Reader:UpdateReaderButton", this)
      }

      windowTracker.addOpenListener(this.onOpenWindow)

      for (const window of windowTracker.browserWindows()) {
        this.onOpenWindow(window)
      }
    }
    exit(reason) {
      windowTracker.removeOpenListener(this.onOpenWindow)
      if (this.config.popup) {
        Services.mm.removeMessageListener("Reader:UpdateReaderButton", this)
      }

      for (const window of windowTracker.browserWindows()) {
        this.resetWindow(window)
      }
    }
    onOpenWindow({ document }) {
      patchIcon(document, this.config)
      if (this.config.popup) {
        this.addPopupListeners(document)
      }
    }
    resetWindow({ document }) {
      resetIcon(document)
      if (this.config.popup) {
        removePopupView(document)
        this.removePopupListeners(document)
      }
    }
    addPopupListeners(document) {
      document.addEventListener(PRIMARY_ACTION, this)
      document.addEventListener(SECONDARY_ACTION, this)
    }
    removePopupListeners(document) {
      document.removeEventListener(PRIMARY_ACTION, this)
      document.removeEventListener(SECONDARY_ACTION, this)
    }

    handleEvent(event) {
      switch (event.type) {
        case PRIMARY_ACTION:
          return this.onPrimaryAction(event.target)
        case SECONDARY_ACTION:
          return this.onSecondaryAction(event.target)
      }
    }
    receiveMessage(message) {
      switch (message.name) {
        case "Reader:UpdateReaderButton": {
          return this.onReaderButtonUpdate(message)
        }
      }
    }

    onPrimaryAction(document) {
      const button = getReaderButton(document)
      if (button) {
        button.click()
      }
    }
    onSecondaryAction(document) {
      hidePopup(document)
    }
    onReaderButtonUpdate({ target, data }) {
      if (data && data.isArticle) {
        showPopup(target.ownerDocument, this.config.popup)
      } else {
        hidePopup(target.ownerDocument)
      }
    }
  }

  const patchIcon = (document, { iconURL, iconWidth }) => {
    const icon = getReaderButton(document)
    icon.style.listStyleImage = `url(${iconURL})`
    icon.style.width = `${iconWidth}px`
  }

  const resetIcon = document => {
    const icon = getReaderButton(document)
    if (icon) {
      icon.removeAttribute("style")
    }
  }

  const hidePopup = async document => {
    const panel = getPopupView(document)
    if (panel) {
      await document.defaultView.PanelMultiView.hidePopup(panel)
    }
  }

  const showPopup = async (document, popup) => {
    const panel = getPopupView(document) || makePopupView(document, popup)
    const button = getReaderButton(document)
    await document.defaultView.PanelMultiView.openPopup(
      panel,
      button,
      "bottomcenter topleft"
    )
  }

  const getReaderButton = document => document.getElementById(ID)
  const getPopupView = document => document.getElementById(POPUP_ID)

  const removePopupView = document => {
    const view = getPopupView(document)
    if (view) {
      view.remove()
    }
  }

  const makePopupView = (document, popup) => {
    var panel = document.createXULElement("panel")
    panel.classList.add("popup-notification-panel")
    panel.setAttribute("id", POPUP_ID)
    panel.setAttribute("followanchor", true)
    panel.setAttribute("type", "arrow")
    // panel.setAttribute("noautohide", true)

    const notification = panel.appendChild(
      document.createXULElement("popupnotification")
    )
    notification.setAttribute("name", popup.title)
    notification.setAttribute("orient", "vertical")

    notification.setAttribute("buttonlabel", popup.primaryButtonLabel)
    notification.setAttribute("buttonhighlight", true)
    notification.setAttribute(
      "buttoncommand",
      `document.dispatchEvent(new CustomEvent("${PRIMARY_ACTION}"))`
    )

    notification.setAttribute("icon", popup.iconURL)
    notification.setAttribute("closebuttonhidden", "true")
    notification.setAttribute("checkboxhidden", "true")

    notification.setAttribute(
      "secondarybuttonlabel",
      popup.secondaryButtonLabel
    )
    notification.setAttribute("dropmarkerhidden", "true")
    notification.setAttribute(
      "secondarybuttoncommand",
      `document.dispatchEvent(new CustomEvent("${SECONDARY_ACTION}"))`
    )

    const content = notification.appendChild(
      document.createXULElement("popupnotificationcontent")
    )
    content.setAttribute("orient", "vertical")

    const description = content.appendChild(
      document.createXULElement("description")
    )
    description.textContent = popup.description

    return document.querySelector("#mainPopupSet").appendChild(panel)
  }
  this.readerIcon = class readerIcon extends ExtensionAPI {
    getAPI(context) {
      return {
        readerIcon: {
          activate: async config => {
            this.actor = NarrateActor.spawn(config)
          }
        }
      }
    }
    onShutdown(reason) {
      if (this.actor) {
        this.actor.exit(reason)
        delete this.actor
      }
    }
  }
}
