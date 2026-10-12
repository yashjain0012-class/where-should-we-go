# Demo script (about 6 minutes)

Open the live site on your phone and a laptop side by side if you can (the live room needs two screens). Everything works
with no sign-in. Each step says what to do and what to point out.

## 1. The core idea (1 minute)

1. Type **Shoreditch, London** (or your own neighbourhood) and press **Search**. A wheel of the 8 nearest restaurants fills in, the map shows matching numbered pins, and a weather chip shows the temperature where you searched.
2. Press **Spin!** Point out: the **ticking sound slows down with the wheel** (it is generated in the browser, timed from the same curve as the animation), the winning slice pops out, confetti, the winning pin bounces on the map.
3. On the result card: walking time, **Directions** (Google, Apple, OpenStreetMap), **Add to calendar** (an `.ics` file built in the browser).

## 2. Smarter discovery (1 minute)

1. Open **More filters**, choose **Vegetarian**: the wheel re-fills at once, untagged places are marked "unconfirmed" and come after confirmed ones. Say why: OpenStreetMap tags are patchy, so nothing is silently dropped.
2. Turn on **Open now**, then **Open when? → Tonight 9 pm**. Hours are checked on **the place's own clock**, not yours.
3. If the weather chip says it is raining, **Indoor places first** is on by default.

## 3. Personal, with no account (45 seconds)

1. Tap the ☆ on two options: their slices get **twice as big** (the pointer maths and the tick sound still agree).
2. After a spin, tap **Never show again**, then open **My picks and preferences**: history, favourites, hidden places, "skip places that won in the last 14 days", and **Clear my data**. Everything is in the browser's `localStorage`; nothing is sent anywhere.

## 4. Decide as a group (2 minutes)

1. **Take turns vetoing**: choose 3 people, pass the phone, each removes one option.
2. **Head-to-head instead**: a knockout, two at a time. The wheel then turns to show the same winner.
3. **✏️ My own list**: type `Movie night x2`, `Board games`, `Hike`, `Cook together` (the `x2` doubles the slice) and **Put on the wheel**. It works for anything, not just places.
4. **👥 Live room** (needs a second device or a second browser window): the host copies the room link; the friend opens it, sees the same wheel, and **vetoes one option**. The host spins and **both screens land on the same result**. The room is peer-to-peer: there is no server of ours in the path.

## 5. It is an app, and for everyone (45 seconds)

1. Chrome's **Install** / iPhone's **Add to Home Screen**: its own icon, full screen. Turn on airplane mode and reopen it: it opens and offers **Open my last wheel**.
2. **Share as picture**: draws a "Let's go to ..." card and opens the share sheet (or downloads it).
3. On a phone, tap **📳** and **shake** to spin; the phone vibrates as the wheel slows.
4. Top right: **हिन्दी** switches the whole interface to Hindi; **Auto / Light / Dark** and **km / mi** are there too.

## If something goes wrong

- Search says the free servers are busy: wait a few seconds and press **Try again** (OpenStreetMap's public servers are shared); a shorter distance is faster.
- The live room says it couldn't connect: some networks block direct device-to-device connections. Use **Copy link** on an ordinary wheel instead (each friend spins on their own).
- A wheel from the spinner is also a link: **Copy link** shares exactly what is on screen, and opening it makes no new searches.
