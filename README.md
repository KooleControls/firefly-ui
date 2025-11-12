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

## Interesting Forks/In Chinese, we call it 「花样玩法」

- [vianroyal](https://github.com/vianroyal)/[t-rex-runner](https://github.com/vianroyal/t-rex-runner) [Kumamon runner](http://vianroyal.github.io/t-rex-runner/) 
<br>

![](assets/kumamon-runner.gif)

- [xkuga](https://github.com/xkuga)/[t-rex-runner](https://github.com/xkuga/t-rex-runner) [Hello KuGou](http://hellokugou.com/) 
<br>

![](assets/hello-kugou.gif)

- [d-nery](https://github.com/d-nery/)/[t-rex-runner](https://github.com/d-nery/t-rex-runner) [Novas coisas](http://d-nery.github.io/t-rex-runner/) 
<br>

![](assets/novas-coisas.gif)

- [chirag64](https://github.com/chirag64)/[t-rex-runner-bot](https://github.com/chirag64/t-rex-runner-bot) [t-rex runner bot](https://chirag64.github.io/t-rex-runner-bot/) 
<br>

![](assets/t-rex-runner-bot.gif)

- [19janil](https://github.com/19janil)/[t-rex-runner](https://github.com/19janil/t-rex-runner) [t-rex runner](https://19janil.github.io/t-rex-runner/) 
<br>

![](assets/t-rex-runner-19janil.gif)

- [enthus1ast](https://github.com/enthus1ast)/[chromeTrip](https://github.com/enthus1ast/chromeTrip) [Chrome Trip by code0](https://code0.itch.io/chrome-trip) 
<br>

![](https://user-images.githubusercontent.com/13794470/37289691-964618be-260a-11e8-8c4a-6df04d6c490d.gif)

- [zouariste](https://github.com/zouariste)/[corona-runner](https://github.com/zouariste/corona-runner) [Corona runner](https://zouariste.github.io/corona-runner/) 
<br>

![](https://raw.githubusercontent.com/zouariste/corona-runner/gh-pages/assets/corona-runner.gif)
