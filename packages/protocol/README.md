# @exploding-catan/protocol

The wire contract between the browser and the server, plus the small rules
both sides apply to what travels: `cleanName`, `normalizeRoomConfig`, the
emoji tray, the chat limit, the default avatar. JSON messages over one
WebSocket; every server message carries the server's clock.
