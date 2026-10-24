import Intents
import UserNotifications

/// Shows a bot's message as a message from that bot: its picture large, the app icon in the
/// corner, its name as the title. If the push has no sender, or the picture can't be fetched in
/// time, the notification is shown exactly as it arrived (with the normal app icon).
final class NotificationService: UNNotificationServiceExtension {
  /// One session for the life of the process; iOS reuses it across pushes.
  private static let session: URLSession = {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.timeoutIntervalForRequest = 5
    configuration.timeoutIntervalForResource = 6
    return URLSession(configuration: configuration)
  }()

  private let lock = NSLock()
  private var contentHandler: ((UNNotificationContent) -> Void)?
  private var original: UNNotificationContent?
  private var task: URLSessionDataTask?

  override func didReceive(
    _ request: UNNotificationRequest,
    withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
  ) {
    lock.withLock {
      self.contentHandler = contentHandler
      original = request.content
    }
    guard let sender = PushSender(userInfo: request.content.userInfo) else {
      return finish(request.content)
    }
    let task = Self.session.dataTask(with: sender.avatarURL) {
      [weak self] data, response, _ in
      guard let self else { return }
      guard let avatar = PushSender.avatar(data: data, response: response),
        let content = Self.message(request.content, from: sender, avatar: avatar)
      else { return self.finish(request.content) }
      self.finish(content)
    }
    lock.withLock { self.task = task }
    task.resume()
  }

  override func serviceExtensionTimeWillExpire() {
    let (task, original) = lock.withLock { (self.task, self.original) }
    task?.cancel()
    if let original { finish(original) }
  }

  /// Hands iOS one notification, once, whichever path gets here first.
  private func finish(_ content: UNNotificationContent) {
    let handler = lock.withLock { () -> ((UNNotificationContent) -> Void)? in
      defer { contentHandler = nil }
      return contentHandler
    }
    handler?(content)
  }

  /// The push as an incoming message from the bot (iOS Communication Notifications).
  private static func message(
    _ content: UNNotificationContent, from sender: PushSender, avatar: Data
  ) -> UNNotificationContent? {
    let image = INImage(imageData: avatar)
    let person = INPerson(
      personHandle: INPersonHandle(value: sender.botId, type: .unknown),
      nameComponents: nil,
      displayName: sender.name,
      image: image,
      contactIdentifier: nil,
      customIdentifier: sender.botId
    )
    let intent = INSendMessageIntent(
      recipients: nil,
      outgoingMessageType: .outgoingMessageText,
      content: content.body,
      speakableGroupName: nil,
      conversationIdentifier: sender.conversationId,
      serviceName: nil,
      sender: person,
      attachments: nil
    )
    intent.setImage(image, forParameterNamed: \.sender)
    let interaction = INInteraction(intent: intent, response: nil)
    interaction.direction = .incoming
    interaction.donate(completion: nil)
    return try? content.updating(from: intent)
  }
}
