// Yolda Kaldık — iOS/Android uygulaması
// Web uygulamasını (müşteri ve çekici paneli) tam ekran açar; yerel bildirim, arama,
// harita ve kamera gibi telefon özelliklerini web tarafına köprüler.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Image, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import * as SplashScreen from 'expo-splash-screen';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

const BASE = (Constants.expoConfig?.extra?.appUrl || 'https://yolda-kaldik.onrender.com').replace(/\/$/, '');
const HOST = BASE.replace(/^https?:\/\//, '');
const MODE_KEY = 'yk:mode'; // '/' müşteri, '/cekici' çekici

SplashScreen.preventAutoHideAsync().catch(() => {});

// Uygulama açıkken web tarafı zaten uyarı gösterir; sistem bildirimi listeye düşsün, yeni iş teklifinde ses çalsın
Notifications.setNotificationHandler({
  handleNotification: async (n) => {
    const offer = n.request.content.data?.type === 'offer';
    return { shouldShowBanner: offer, shouldShowList: true, shouldPlaySound: offer, shouldSetBadge: false };
  },
});

async function registerForPush(prompt) {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', { name: 'Genel', importance: Notifications.AndroidImportance.HIGH, vibrationPattern: [0, 250, 250, 250], lightColor: '#EA580C' });
    await Notifications.setNotificationChannelAsync('jobs', { name: 'Yeni iş teklifleri', importance: Notifications.AndroidImportance.MAX, vibrationPattern: [0, 400, 150, 400, 150, 400], sound: 'default' });
  }
  if (!Device.isDevice) throw new Error('Bildirimler yalnızca gerçek cihazda çalışır');
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted' && prompt) status = (await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: true, allowSound: true } })).status;
  if (status !== 'granted') throw new Error('Bildirim izni verilmedi. Ayarlar → Yolda Kaldık → Bildirimler bölümünden açabilirsiniz.');
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) throw new Error('EAS projectId bulunamadı');
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  return data;
}

export default function App() {
  const web = useRef(null);
  const [mode, setMode] = useState(null); // null: yükleniyor, '': seçim ekranı
  const [canBack, setCanBack] = useState(false);
  const [failed, setFailed] = useState(false);
  const pendingUrl = useRef(null);

  // İlk açılış: kayıtlı mod (müşteri/çekici)
  useEffect(() => {
    AsyncStorage.getItem(MODE_KEY).then((m) => setMode(m || '')).catch(() => setMode(''));
  }, []);
  useEffect(() => {
    if (mode === '') SplashScreen.hideAsync().catch(() => {});
    if (mode && mode.startsWith('/cekici')) activateKeepAwakeAsync('yk').catch(() => {});
    else deactivateKeepAwake('yk');
  }, [mode]);

  const send = useCallback((msg) => {
    web.current?.injectJavaScript(`window.__ykNative && window.__ykNative(${JSON.stringify(msg)}); true;`);
  }, []);

  const open = useCallback((path) => {
    const url = path.startsWith('http') ? path : BASE + path;
    if (web.current) web.current.injectJavaScript(`location.href = ${JSON.stringify(url)}; true;`);
    else pendingUrl.current = url;
  }, []);

  // Bildirime dokununca ilgili sayfayı aç
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      const url = r.notification.request.content.data?.url;
      if (url) open(url);
    });
    Notifications.getLastNotificationResponseAsync().then((r) => {
      const url = r?.notification?.request?.content?.data?.url;
      if (url) pendingUrl.current = BASE + url;
    });
    return () => sub.remove();
  }, [open]);

  // Android geri tuşu
  useEffect(() => {
    const h = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canBack && web.current) { web.current.goBack(); return true; }
      return false;
    });
    return () => h.remove();
  }, [canBack]);

  const choose = async (m) => {
    await AsyncStorage.setItem(MODE_KEY, m).catch(() => {});
    setMode(m);
  };

  const onMessage = async (e) => {
    let msg;
    try { msg = JSON.parse(e.nativeEvent.data); } catch { return; }
    if (msg.type === 'push:register') {
      try {
        const token = await registerForPush(msg.prompt !== false);
        send({ type: 'push:token', token, platform: Platform.OS });
      } catch (err) {
        send({ type: 'push:error', message: err.message });
      }
    }
  };

  // Uygulama dışı bağlantılar (arama, SMS, harita, başka siteler) telefonda açılsın
  const onShouldStart = (req) => {
    const u = req.url;
    if (u.startsWith(BASE) || u.startsWith('about:') || u.startsWith('data:') || u.startsWith('blob:')) {
      const path = u.slice(BASE.length) || '/';
      const m = path.startsWith('/cekici') ? '/cekici' : path.startsWith('/admin') ? null : '/';
      if (m && m !== mode) AsyncStorage.setItem(MODE_KEY, m).catch(() => {});
      return true;
    }
    if (!req.isTopFrame) return true; // harita döşemeleri, fontlar vb.
    Linking.openURL(u).catch(() => {});
    return false;
  };

  if (mode === null) return <View style={styles.dark} />;

  if (mode === '') {
    return (
      <View style={styles.chooser}>
        <StatusBar style="light" />
        <Image source={require('./assets/splash-icon.png')} style={styles.logo} />
        <Text style={styles.title}>Yolda Kaldık</Text>
        <Text style={styles.sub}>Nasıl devam etmek istersiniz?</Text>
        <Pressable style={[styles.btn, styles.btnMain]} onPress={() => choose('/')}>
          <Text style={styles.btnText}>Çekici çağırmak istiyorum</Text>
          <Text style={styles.btnSub}>Müşteri uygulaması</Text>
        </Pressable>
        <Pressable style={[styles.btn, styles.btnAlt]} onPress={() => choose('/cekici')}>
          <Text style={styles.btnText}>Çekiciyim / kurtarma firmasıyım</Text>
          <Text style={styles.btnSub}>Çekici paneli</Text>
        </Pressable>
        <Text style={styles.note}>Bu seçimi uygulama içinden istediğiniz zaman değiştirebilirsiniz.</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <StatusBar style="dark" />
      {failed ? (
        <View style={styles.chooser}>
          <StatusBar style="light" />
          <Text style={styles.title}>Bağlantı kurulamadı</Text>
          <Text style={styles.sub}>İnternet bağlantınızı kontrol edip tekrar deneyin.</Text>
          <Pressable style={[styles.btn, styles.btnMain]} onPress={() => { setFailed(false); web.current?.reload(); }}>
            <Text style={styles.btnText}>Tekrar dene</Text>
          </Pressable>
        </View>
      ) : null}
      <WebView
        ref={web}
        style={[styles.web, failed && { flex: 0, height: 0 }]}
        source={{ uri: pendingUrl.current || BASE + mode }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        geolocationEnabled
        allowsInlineMediaPlayback
        mediaCapturePermissionGrantType="grant"
        allowsBackForwardNavigationGestures={false}
        bounces={false}
        overScrollMode="never"
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        setSupportMultipleWindows={false}
        applicationNameForUserAgent="YoldaKaldikApp/1.0"
        onShouldStartLoadWithRequest={onShouldStart}
        onOpenWindow={(e) => Linking.openURL(e.nativeEvent.targetUrl).catch(() => {})}
        onMessage={onMessage}
        onNavigationStateChange={(s) => setCanBack(s.canGoBack)}
        onLoadEnd={() => { SplashScreen.hideAsync().catch(() => {}); pendingUrl.current = null; }}
        onError={() => setFailed(true)}
        onHttpError={(e) => { if (e.nativeEvent.statusCode >= 500 && e.nativeEvent.url?.includes(HOST)) setFailed(true); }}
        startInLoadingState
        renderLoading={() => (
          <View style={[styles.dark, StyleSheet.absoluteFill, styles.center]}>
            <ActivityIndicator color="#EA580C" size="large" />
            <Text style={styles.loading}>Bağlanıyor… (ilk açılış 30 sn sürebilir)</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#f2f5f4' },
  web: { flex: 1, backgroundColor: '#f2f5f4' },
  dark: { flex: 1, backgroundColor: '#0b2b33' },
  center: { alignItems: 'center', justifyContent: 'center' },
  loading: { color: '#c9d4d6', marginTop: 14, fontSize: 14 },
  chooser: { flex: 1, backgroundColor: '#0b2b33', alignItems: 'stretch', justifyContent: 'center', paddingHorizontal: 24 },
  logo: { width: 96, height: 96, borderRadius: 24, alignSelf: 'center', marginBottom: 18 },
  title: { color: '#fff', fontSize: 28, fontWeight: '800', textAlign: 'center' },
  sub: { color: '#c9d4d6', fontSize: 16, textAlign: 'center', marginTop: 6, marginBottom: 28 },
  btn: { borderRadius: 18, paddingVertical: 16, paddingHorizontal: 18, marginBottom: 12 },
  btnMain: { backgroundColor: '#EA580C' },
  btnAlt: { backgroundColor: '#134049' },
  btnText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  btnSub: { color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 2 },
  note: { color: '#93a4a7', fontSize: 12, textAlign: 'center', marginTop: 10 },
});
