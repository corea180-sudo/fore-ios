/* 아이폰 앱 틀 — apps.json 한 곳이 정본. 앱마다 apps/<key>/ 에 Capacitor 프로젝트를 세운다(라이브 주소를 띄운다) */
const fs = require('fs'), path = require('path'), cp = require('child_process');
const A = JSON.parse(fs.readFileSync(path.join(__dirname, 'apps.json'), 'utf8'));
const only = process.argv[2];
const ROOT = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));   /* 플러그인 판은 맨 위 package.json 한 곳 */
for (const a of A) {
  if (only && a.key !== only) continue;
  const d = path.join(__dirname, 'apps', a.key); fs.mkdirSync(path.join(d, 'www'), { recursive: true });
  if (!fs.existsSync(path.join(d, 'node_modules'))) fs.symlinkSync('../../node_modules', path.join(d, 'node_modules'));
  fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ name: 'app-' + a.key, private: true, version: '1.0.0', dependencies: ROOT.dependencies, devDependencies: ROOT.devDependencies }, null, 2));
  fs.writeFileSync(path.join(d, 'capacitor.config.json'), JSON.stringify({
    appId: a.appId, appName: a.name, webDir: 'www',
    server: { url: a.url, allowNavigation: [a.host, '*.firebaseapp.com', 'accounts.google.com', '*.kakao.com', 'nid.naver.com'], errorPath: 'offline.html' },
    ios: { contentInset: 'never', backgroundColor: a.bg, limitsNavigationsToAppBoundDomains: false },
    plugins: { SplashScreen: { launchShowDuration: 800, backgroundColor: a.bg, showSpinner: false }, StatusBar: { style: a.style, overlaysWebView: false, backgroundColor: a.bg },
      /* 앱 알림 = Firebase 메시징(FCM 토큰 — 웹 알림과 같은 서버 보내기 손으로 받는다) · 로그인 = 기기 자체 Apple·구글 로그인 → 웹 Firebase 에 넘긴다(skipNativeAuth) */
      FirebaseMessaging: { presentationOptions: ['badge', 'sound', 'alert'] },
      FirebaseAuthentication: { skipNativeAuth: true, providers: ['apple.com', 'google.com'] } },
    experimental: { ios: { spm: { swiftToolsVersion: '6.1', packageOptions: { '@capacitor-firebase/authentication': { symlink: true }, '@capacitor-firebase/messaging': { symlink: true } }, packageTraits: { '@capacitor-firebase/authentication': ['Google'] } } } },
  }, null, 2));
  /* 인터넷이 끊겼을 때 보이는 앱 안 화면(빈 화면 대신) */
  fs.writeFileSync(path.join(d, 'www', 'index.html'), `<!DOCTYPE html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${a.name}</title><script>location.replace(${JSON.stringify(a.url)})</script>`);
  fs.writeFileSync(path.join(d, 'www', 'offline.html'), `<!DOCTYPE html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${a.name}</title>
<style>html,body{margin:0;height:100%;background:${a.bg};color:${a.style === 'DARK' ? '#E8EAF0' : '#0B1020'};font:16px -apple-system,'Apple SD Gothic Neo',sans-serif;display:grid;place-items:center;text-align:center}button{margin-top:22px;height:46px;padding:0 26px;border:0;border-radius:12px;background:#2F55FF;color:#fff;font:600 16px inherit}</style>
<div><b style="font-size:20px">인터넷에 연결되어 있지 않습니다</b><p style="opacity:.7;margin:10px 0 0">연결을 확인한 뒤 다시 시도해 주십시오.</p><button onclick="location.replace(${JSON.stringify(a.url)})">다시 시도</button></div></html>`);
  if (!fs.existsSync(path.join(d, 'ios'))) cp.execSync('npx cap add ios', { cwd: d, stdio: 'inherit' });
  cp.execSync('npx cap sync ios', { cwd: d, stdio: 'inherit' });
  patchIos(d, a);
  /* 앱 아이콘 — res/<key>-1024.png(알파 없는 1024) 한 장에서 iOS 크기 전부 */
  fs.mkdirSync(path.join(d, 'assets'), { recursive: true }); fs.copyFileSync(path.join(__dirname, 'res', a.key + '-1024.png'), path.join(d, 'assets', 'icon-only.png'));
  cp.execSync(`npx capacitor-assets generate --ios --iconBackgroundColor '${a.bg}' --splashBackgroundColor '${a.bg}'`, { cwd: d, stdio: 'pipe' });
  console.log('✔', a.key, a.appId);
}

/* cap 이 만든 Xcode 프로젝트에 우리 값을 얹는다 — 여러 번 돌려도 같은 결과(이미 있으면 건너뜀) */
function patchIos(d, a) {
  const app = path.join(d, 'ios/App'), pbx = path.join(app, 'App.xcodeproj/project.pbxproj');
  let p = fs.readFileSync(pbx, 'utf8');
  if (!p.includes('CODE_SIGN_ENTITLEMENTS')) p = p.replace(/CODE_SIGN_STYLE = Automatic;/g, 'CODE_SIGN_ENTITLEMENTS = App/App.entitlements;\n\t\t\t\tCODE_SIGN_STYLE = Automatic;\n\t\t\t\tDEVELOPMENT_TEAM = 8G66DP2U52;');
  p = p.replace(/MARKETING_VERSION = [^;]+;/g, 'MARKETING_VERSION = 1.0.0;');

  p = p.replace(/TARGETED_DEVICE_FAMILY = "1,2";/g, 'TARGETED_DEVICE_FAMILY = 1;');   /* 아이폰 전용 — 아이패드 화면·심사를 따로 받지 않는다 */
  /* Firebase 설정 파일(GoogleService-Info.plist)을 앱 묶음 맨 위 자원으로 — config.xml 줄을 본떠 넣는다 */
  if (!p.includes('GoogleService-Info.plist')) {
    const B = 'F0E1D2C3B4A5968778695A01', R = 'F0E1D2C3B4A5968778695A02';
    p = p.replace(/(\t\t2FAD9763203C412B000D30F8 \/\* config\.xml in Resources \*\/ = \{[^\n]*\n)/, `$1\t\t${B} /* GoogleService-Info.plist in Resources */ = {isa = PBXBuildFile; fileRef = ${R} /* GoogleService-Info.plist */; };\n`)
         .replace(/(\t\t2FAD9762203C412B000D30F8 \/\* config\.xml \*\/ = \{[^\n]*\n)/, `$1\t\t${R} /* GoogleService-Info.plist */ = {isa = PBXFileReference; lastKnownFileType = text.plist.xml; path = "GoogleService-Info.plist"; sourceTree = "<group>"; };\n`)
         .replace(/(\t\t\t\t2FAD9762203C412B000D30F8 \/\* config\.xml \*\/,\n)/, `$1\t\t\t\t${R} /* GoogleService-Info.plist */,\n`)
         .replace(/(\t\t\t\t2FAD9763203C412B000D30F8 \/\* config\.xml in Resources \*\/,\n)/, `$1\t\t\t\t${B} /* GoogleService-Info.plist in Resources */,\n`);
    if ((p.match(/GoogleService-Info\.plist/g) || []).length !== 6) throw new Error('GoogleService-Info.plist 를 프로젝트에 넣지 못했다 — config.xml 줄 모양이 바뀌었다');
  }
  fs.writeFileSync(pbx, p);
  fs.copyFileSync(path.join(__dirname, 'res', 'gsi', a.key + '.plist'), path.join(app, 'App', 'GoogleService-Info.plist'));
  fs.writeFileSync(path.join(app, 'App/App.entitlements'), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>aps-environment</key><string>production</string><key>com.apple.developer.applesignin</key><array><string>Default</string></array></dict></plist>
`);
  const ip = path.join(app, 'App/Info.plist'); let pl = fs.readFileSync(ip, 'utf8');
  const add = (k, v) => { if (!pl.includes(`<key>${k}</key>`)) pl = pl.replace(/<dict>\n/, `<dict>\n\t<key>${k}</key>\n\t${v}\n`); };
  add('ITSAppUsesNonExemptEncryption', '<false/>');
  add('UIBackgroundModes', '<array><string>remote-notification</string></array>');
  const rev = (fs.readFileSync(path.join(__dirname, 'res', 'gsi', a.key + '.plist'), 'utf8').match(/<key>REVERSED_CLIENT_ID<\/key>\s*<string>([^<]+)<\/string>/) || [])[1];
  if (rev) add('CFBundleURLTypes', `<array><dict><key>CFBundleURLSchemes</key><array><string>${rev}</string></array></dict></array>`);
  pl = pl.replace(/(<key>CFBundleDisplayName<\/key>\s*<string>)[^<]*(<\/string>)/, `$1${a.name}$2`);
  fs.writeFileSync(ip, pl);
  const ad = path.join(app, 'App/AppDelegate.swift'); let s = fs.readFileSync(ad, 'utf8');
  /* 구글 로그인 복귀 주소는 SceneDelegateProxy 가 플러그인에 넘긴다(Capacitor 8 장면 방식) — 앱 쪽에 Firebase 를 직접 들이지 않는다 */
  if (!s.includes('capacitorDidRegisterForRemoteNotifications')) s = s.replace(/\n}\s*$/, `

    // 앱 알림 — 기기 토큰을 Capacitor 알림 플러그인에 넘긴다
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

    func application(_ application: UIApplication, didReceiveRemoteNotification userInfo: [AnyHashable: Any], fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void) {
        NotificationCenter.default.post(name: Notification.Name.init("didReceiveRemoteNotification"), object: completionHandler, userInfo: userInfo)
    }
}
`);
  fs.writeFileSync(ad, s);
}
