## t-rex-runner

the trex runner game extracted from chrome offline err page.

see the [source](https://cs.chromium.org/chromium/src/components/neterror/resources/offline.js?q=t-rex+package:%5Echromium$&dr=C&l=7) from chromium


[go and enjoy! :smile: ](http://wayou.github.io/t-rex-runner/)

![chrome offline game cast](assets/screenshot.gif)

## Event Stream Format

The game connects to an event stream API that sends individual event objects (not arrays). Each event has the following format:

```json
{
  "mac": "d324sdDEI",
  "event": "button|startup|disconnected",
  "name": "tiny-rex",
  "value": 34
}
```

### Event Types

- **`startup`**: When a device starts up, a new dino is added to the game
- **`disconnected`**: When a device disconnects, the corresponding dino is removed from the game
- **`button`**: When a button is pressed, the corresponding dino jumps

### Example Events

**Device startup:**
```json
{
  "mac": "d324sdDEI",
  "event": "startup",
  "name": "tiny-rex",
  "value": 0
}
```

**Button press:**
```json
{
  "mac": "d324sdDEI",
  "event": "button",
  "name": "tiny-rex",
  "value": 34
}
```

**Device disconnects:**
```json
{
  "mac": "d324sdDEI",
  "event": "disconnected",
  "name": "tiny-rex",
  "value": 0
}
```

## 🚀 Local Development Setup

This project uses [`live-server`](https://www.npmjs.com/package/live-server) to automatically reload the browser whenever you make changes to your files.

### 📦 Prerequisites

You’ll need [Node.js](https://nodejs.org/) installed on your system.
