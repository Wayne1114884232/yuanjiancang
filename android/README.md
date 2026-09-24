# Android update code

AppUpdater implements a native version check, explicit update prompt, bounded HTTPS download, SHA256 and package/signature verification, and Android installer handoff. UpdateFileProvider grants read access only to the downloaded update APK.

MainActivity creates the updater, calls resume on foreground entry, closes it on destroy, and exposes a no-argument checkForUpdates bridge. The bridge never accepts a URL supplied by a webpage. The manifest declares REQUEST_INSTALL_PACKAGES and a non-exported, URI-granting provider with authority com.wayne.componenthub.team.updates.

The workspace builder is work/build-cloud-apk.mjs; it uses the retained Android baseline and copies these Java sources into the project. Signing secrets stay outside this repository. Future releases must bump the release.mjs version/code and rebuild/sign the APK before deploying; /api/version returns the digest of the actual served package.

2.2.6 uses AndroidX FileProvider with files/updates as its only root, explicit read grants and ClipData. An external browser fallback is available. Old installations with a broken installer handoff need one browser-download bootstrap; device-specific installation is not covered by Node tests.
