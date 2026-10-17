<p align="center"> [<a href="README.md">中文</a>] | [English] | [<a href="README_es.md">Español</a>]</p>

# 📑Introduction
media-paw is a resource sniffing extension that can help you filter and list the resources of the current page.

# 📖Installation
## 🐴Chrome
TODO
## 🦄Edge
TODO
## 🦊Firefox
TODO
## 📱Edge Android
TODO

# 📘 Installation Methods
## App Store Installation
Install directly from the official extension store using the link provided.
## Source Code Installation
This project is built with the [Plasmo](https://www.plasmo.com/) framework. The source directory cannot be loaded directly — build it first:
1. Git clone the repository.
2. `npm install`
3. `npm run build`
4. Open the extensions management page and enable "Developer Mode."
5. Click "Load unpacked" and select the `build/chrome-mv3-prod` directory.
## CRX Installation
1. **Right-click** and save the CRX file from [Releases](https://github.com/dubaohao/media-paw/releases).
2. Open the extensions management page and enable "Developer Mode."
3. Drag the CRX file into the extensions page.

# 🛠️Development
```shell
npm install
npm run dev
```
The development build outputs to `build/chrome-mv3-dev` (extension name is prefixed with `DEV ｜ `) with hot-reload support. Load that directory and your changes will be rebuilt automatically.
- `npm run build`: production build, outputs `build/chrome-mv3-prod`
- `npm run package`: package into zip/crx

# 📚Compatibility
After version 1.0.17, Chromium kernel version 93 or above is required.
Use version 1.0.16 if below 93.
For full functionality, use version 104 or above.

# 🤚🏻Disclaimer
This extension is intended for downloading videos that you own or have authorized access to. It is prohibited to use this Tool for downloading copyrighted content without permission. Users are solely responsible for their actions, and the developer is not liable for any user behavior. This Tool is provided "as-is," and the developer assumes no direct or indirect liability.

# 🚫 Copyright Protection and Opt-Out Policy
We respect the intellectual property rights and legitimate interests of all websites and their operators.
If you do not permit this tool to operate on your website, please follow the procedure below to submit a request. We will add your domain to the project's "Opt-Out List."
- Create a new **Issue** in this repository.
- **Please use the following title format:** `[Opt-Out Request] YourDomain.com`

In the Issue description, please provide the following information for verification:
- **Website Domain:** (e.g., `example.com`)
- **Contact Email:** (For identity verification when necessary).

We commit to honoring your request and will add verified domains to the Opt-Out list in subsequent version updates.
Please note that this is an open-source project, and updates and releases require a certain cycle. Thank you for your understanding and cooperation.



# 🔒Privacy Policy
The extension collects and processes all information locally without sending it to remote servers and does not include any trackers.

# 💖Acknowledgements
- [Plasmo](https://github.com/PlasmoHQ/plasmo)
- [React](https://github.com/facebook/react)
- [hls.js](https://github.com/video-dev/hls.js)
- [mux.js](https://github.com/videojs/mux.js)
- [Momo707577045](https://github.com/Momo707577045)
- [mpd-parser](https://github.com/videojs/mpd-parser)
- [StreamSaver.js](https://github.com/jimmywarting/StreamSaver.js)

# 📎Reference Project
This project is a revamp of cat-catch. The original repository and documentation below are outdated and for reference only:
- Original repository: https://github.com/xifangczy/cat-catch
- Original documentation: https://o2bmm.gitbook.io/cat-catch/

# 📜License
GPL-3.0 license

Version 1.0 uses the MIT license.

Version 2.0 has changed to the GPL v3 license.

In order for the resource sniffing extension to develop well, it is hoped that extensions using the media-paw source code will continue to be open source.
