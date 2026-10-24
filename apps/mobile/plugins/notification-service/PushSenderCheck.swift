// Checks PushSender, the part of the notification service that decides between a bot's picture
// and the plain push. It is not built into the app. Run it on a Mac or Linux with Swift:
//   swiftc -o /tmp/push-sender-check PushSender.swift PushSenderCheck.swift && /tmp/push-sender-check
import Foundation

#if canImport(FoundationNetworking)
  import FoundationNetworking
#endif

var failures = 0
func check(_ condition: Bool, _ label: String) {
  print("\(condition ? "ok  " : "FAIL") \(label)")
  if !condition { failures += 1 }
}

let link = "https://rakazo.example/api/push-avatar?token=abc.def"
let sender: [String: Any] = ["name": "Remy", "avatarUrl": link]
let data: [String: Any] = ["botId": "bot-1", "threadId": "th-1", "sender": sender]

let parsed = PushSender(userInfo: ["body": data])
check(parsed?.name == "Remy" && parsed?.botId == "bot-1", "reads the bot's name and id")
check(parsed?.avatarURL.absoluteString == link, "reads the picture link")
check(parsed?.conversationId == "th-1", "groups by the bot's thread")

let json = String(data: try! JSONSerialization.data(withJSONObject: data), encoding: .utf8)!
check(PushSender(userInfo: ["body": json]) == parsed, "reads data sent as JSON text")

var group = data
group["groupId"] = "group-9"
check(PushSender(userInfo: ["body": group])?.conversationId == "th-1", "keeps a group bot's thread")

var plain = data
plain.removeValue(forKey: "sender")
check(PushSender(userInfo: ["body": plain]) == nil, "a push with no sender stays plain")
check(PushSender(userInfo: [:]) == nil, "a push with no data stays plain")
check(PushSender(userInfo: ["body": "not json"]) == nil, "junk data stays plain")
for (key, value) in [("avatarUrl", "http://rakazo.example/a.png"), ("avatarUrl", ""), ("name", "")] {
  var bad = sender
  bad[key] = value
  var body = data
  body["sender"] = bad
  check(PushSender(userInfo: ["body": body]) == nil, "rejects \(key)=\"\(value)\"")
}
var noBot = data
noBot.removeValue(forKey: "botId")
check(PushSender(userInfo: ["body": noBot]) == nil, "a sender without a bot id stays plain")

func response(_ status: Int, _ type: String) -> URLResponse {
  HTTPURLResponse(
    url: URL(string: link)!, statusCode: status, httpVersion: nil,
    headerFields: ["Content-Type": type])!
}
let png = Data([0x89, 0x50, 0x4E, 0x47])
check(PushSender.avatar(data: png, response: response(200, "image/png")) == png, "uses a PNG")
check(PushSender.avatar(data: png, response: response(404, "image/png")) == nil, "drops a 404")
check(PushSender.avatar(data: png, response: response(200, "text/html")) == nil, "drops HTML")
check(PushSender.avatar(data: Data(), response: response(200, "image/png")) == nil, "drops empty")
check(PushSender.avatar(data: nil, response: nil) == nil, "drops a failed fetch")
let huge = Data(count: PushSender.maxAvatarBytes + 1)
check(PushSender.avatar(data: huge, response: response(200, "image/png")) == nil, "drops a huge file")

print(failures == 0 ? "all checks passed" : "\(failures) checks failed")
exit(failures == 0 ? 0 : 1)
