# Yolda Kaldık — iOS / Android uygulaması (Expo)

Web uygulamasını (https://yolda-kaldik.onrender.com) tam ekran açan Expo uygulaması. İlk açılışta kullanıcı **müşteri** veya **çekici** olarak devam etmeyi seçer; seçim saklanır.

Uygulamanın web sürümüne göre farkları:
- **Gerçek iOS/Android bildirimleri:** Expo Push kullanılır. Ana ekrana ekleme gerekmez, yeni iş teklifleri uygulama kapalıyken de sesli gelir.
- **Telefon izinleri:** Konum, kamera (belge ve hasar fotoğrafı) ve galeri izinleri telefonun kendi izin pencereleriyle istenir.
- **Dış bağlantılar telefonda açılır:** Arama, SMS ve yol tarifi (Google Haritalar / Apple Haritalar) bağlantıları telefonun kendi uygulamasında açılır.
- **Ekran açık kalır:** Çekici modunda ekran kapanmaz.

Expo projesi: `7a6ef0e1-decd-48f6-b617-304af15f3afb` (slug `yoldakaldimcom`) · iOS paket kimliği: `com.yoldakaldim.app`

## TestFlight'a gönderme

Gerekenler: [Apple Developer Program](https://developer.apple.com/programs/) üyeliği (yıllık 99 $) ve Expo hesabı. Mac gerekmez; derleme Expo'nun bulut sunucularında yapılır.

```bash
cd yoldakaldimcom
npm install
npx eas-cli@latest login
npx eas-cli@latest init --id 7a6ef0e1-decd-48f6-b617-304af15f3afb   # projeyi bağlar (zaten ayarlı, doğrulama için)
npx eas-cli@latest build --platform ios --profile production --auto-submit
```

İlk derlemede EAS şunları sorar; hepsine **Evet** deyin:
1. Apple ID ile giriş (iki adımlı doğrulama kodu gelir)
2. Dağıtım sertifikası ve provisioning profile oluşturma
3. **Push Notifications** anahtarı (APNs key) oluşturma — bildirimler için gerekli
4. App Store Connect'te uygulama kaydı oluşturma (paket kimliği `com.yoldakaldim.app`)

Derleme yaklaşık 15–25 dakika sürer, ardından otomatik olarak App Store Connect'e yüklenir. Apple'ın işlemesi 10–15 dakika daha sürer. Sonra:

- App Store Connect → Uygulamanız → **TestFlight** → **Dahili Test** grubuna kendinizi ve test kullanıcılarını ekleyin.
- Test cihazına **TestFlight** uygulamasını indirip davetle uygulamayı yükleyin.

Sonraki sürümler için aynı `build ... --auto-submit` komutu yeterli; derleme numarası otomatik artar.

## Notlar

- **Paket kimliği:** `com.yoldakaldim.app` başka bir uygulamada kullanılıyorsa `app.json` → `ios.bundleIdentifier` değerini değiştirin.
- **Android:** Android için `npx eas-cli build -p android` ile derlenebilir. Android'de bildirim için Firebase (FCM V1) anahtarı EAS'e eklenmelidir.
- **Uygulama adresi:** Web uygulamasının adresi `app.json` → `extra.appUrl` alanındadır.
