import Foundation

#if canImport(FoundationNetworking)
  import FoundationNetworking
#endif

/// The bot a push is from, read from the data the server put on a bot's message.
/// Any other push (or a malformed one) has no sender and is shown exactly as it arrived.
struct PushSender: Equatable {
  let botId: String
  let name: String
  let avatarURL: URL
  /// Groups the notifications of one chat with this bot. In a group chat each bot has its own
  /// thread, so iOS never mixes two bots' names and pictures in one conversation.
  let conversationId: String

  /// The largest picture worth waiting for; the server sends 256x256 PNGs.
  static let maxAvatarBytes = 1_000_000

  init?(userInfo: [AnyHashable: Any]) {
    // Expo puts the push's data under "body", as a dictionary or as JSON text.
    let body: [String: Any]?
    if let dictionary = userInfo["body"] as? [String: Any] {
      body = dictionary
    } else if let text = userInfo["body"] as? String,
      let json = try? JSONSerialization.jsonObject(with: Data(text.utf8)) as? [String: Any]
    {
      body = json
    } else {
      body = nil
    }
    guard let body,
      let sender = body["sender"] as? [String: Any],
      let botId = body["botId"] as? String, !botId.isEmpty,
      let name = sender["name"] as? String, !name.isEmpty,
      let link = sender["avatarUrl"] as? String,
      let avatarURL = URL(string: link), avatarURL.scheme == "https"
    else { return nil }
    self.botId = botId
    self.name = name
    self.avatarURL = avatarURL
    conversationId = body["threadId"] as? String ?? botId
  }

  /// The downloaded picture, or nil unless the server answered 200 with a PNG of sane size.
  static func avatar(data: Data?, response: URLResponse?) -> Data? {
    guard let data, !data.isEmpty, data.count <= maxAvatarBytes,
      let http = response as? HTTPURLResponse, http.statusCode == 200,
      http.mimeType == "image/png"
    else { return nil }
    return data
  }
}
