# Yolda Kaldık — Çekici & Yol Yardım Platformu

Martı TAG mantığında çalışan çekici çağırma uygulaması: müşteri haritada konumunu seçer, hizmeti ve varış noktasını belirler, en yakın çekici talebi kabul eder ve müşteri çekiciyi canlı takip eder. Çekiciler platforma **aylık 10.000 TL sabit paket** öder, iş başına komisyon yoktur.

| Uygulama | Adres | Kim kullanır |
|---|---|---|
| Müşteri uygulaması | `/` | Yolda kalan sürücüler |
| Çekici paneli | `/cekici` | Çekici / kurtarma firmaları |
| Yönetim paneli | `/admin` | Platform yöneticisi |

Üçü de telefonda “Ana ekrana ekle” ile uygulama gibi (PWA) kurulabilir.

## Özellikler

**Müşteri**
- Tam ekran harita, sürüklenebilir alış pini, yakındaki çekiciler ve hizmet başına tahmini varış süresi
- Hizmetler: Oto Çekici, Ağır Vasıta, Motosiklet, Yol Yardım (akü, yakıt, lastik, çilingir)
- Varış noktası arama (OpenStreetMap), haritadan seçme, kayıtlı adresler (Evim, Sanayi Sitesi…)
- Şeffaf fiyat: açılış + km ücreti, 22:00–06:00 gece tarifesi, indirim kodu, kurtarma çeki
- Canlı takip: çekici konumu, rota, varış süresi, durum adımları (yolda → geldi → çekiliyor → teslim)
- Tek dokunuşla arama / SMS, yolculuğu paylaşma, iptal, puanlama ve yorum
- Arkadaşını davet et: davetli 250 TL çek alır, ilk kurtarmasında davet eden de 250 TL kazanır
- Kurtarmalarım (geçmiş, zaman çizelgesi), hesap, ayarlar, açık/koyu tema

**Çekici**
- Ayrı hesap türü: plaka, araç, firma, verilen hizmetler
- Çevrimiçi/çevrimdışı; çevrimiçiyken konum otomatik paylaşılır, ekran açık tutulur
- Yeni talepte sesli + titreşimli uyarı, 30 sn’lik teklif ekranı, kabul/reddet
- Aktif iş: müşteriyi arama, Google Haritalar navigasyonu, durum butonları, işi bırakma
- Kazanç ekranı (bugün, 30 gün, puan, paket sonrası net, 7 günlük grafik)
- **Aylık paket**: 10.000 TL / 30 gün, indirim kodu, kartla ödeme, otomatik yenileme, ödeme geçmişi. Paketi olmayan çekici çevrimiçi olamaz; süre bitince otomatik kapanır, bitmeden 3 gün önce hatırlatma gider.

**Yönetim**
- Özet istatistikler ve canlı harita
- İndirim kodu oluşturma: yüzde/tutar, kurtarma veya paket için, ilk kurtarmaya özel, limitler, son tarih, aç/kapat
- Çekiciler (paketi +30 gün uzat / durdur), müşteriler, talepler, ödemeler
- Toplu bildirim gönderme (herkese / müşterilere / çekicilere)

**Hesap güvenliği**
- Kayıtta SMS ile 6 haneli doğrulama kodu (5 dk geçerli, 60 sn'de bir yeniden gönderim, saatte en fazla 5 kod, 5 hatalı denemede iptal)
- “Şifremi unuttum”: SMS koduyla yeni şifre
- SMS sağlayıcı bağlanmadıysa kod ekranda gösterilir (demo)

**Çekici belge onayı**
- Ruhsat, K belgesi, sigorta poliçesi ve ehliyet fotoğrafı yüklenir; yönetici her belgeyi onaylar veya gerekçeyle reddeder
- Onaylanmayan çekici çevrimiçi olamaz, iş göremez ve kabul edemez
- Firma şoförleri K belgesini firmadan devralır

**Hasar fotoğrafları ve sohbet**
- Çekme işlerinde araç yüklenmeden önce ve teslimde en az 2'şer fotoğraf zorunlu (`MIN_DAMAGE_PHOTOS`); müşteri takip ekranında ve geçmişte görür
- Müşteri–çekici arasında uygulama içi sohbet, hazır cevaplar ve fotoğraf gönderme; telefon numarası paylaşmadan yazışma

**Firma (filo) hesabı**
- Kayıtta “Firma” seçilir; tek aylık paket `FLEET_MAX_VEHICLES` (varsayılan 10) araca kadar tüm şoförleri kapsar
- Firma sahibi Filo sekmesinden şoför/araç ekler, filoyu haritada görür, açık talepleri şoförlerine atar

**Randevulu çekme ve acil durum**
- “İleri tarih” ile 30 dk – 14 gün sonrası için randevu; saatinden 45 dk önce otomatik çekici aranır, 2 saat kala hatırlatma
- Acil düğmesi: 112 / 155 / 110 / 156, operatöre okunacak konum, acil kişilere konum SMS'i, “Kaza yaptım, çekici çağır”

**Fiyatlandırma**
- Km başına: binek (oto çekici) **200 TL**, ağır vasıta / tır **300 TL**, motosiklet **150 TL** + açılış ücreti
- Mesafe gerçek yol rotasından hesaplanır (Mapbox Directions → OSRM; ikisi de yoksa tahmini)
- 22:00–06:00 gece tarifesi +%20
- İsteğe bağlı **kasko güvencesi: +350 TL** (indirim kodundan etkilenmez; çekici kazancına dahil edilmez, yönetim panelinde ayrı raporlanır)
- Ortam değişkenleri: `PRICE_KM_OTO`, `PRICE_KM_AGIR`, `PRICE_KM_MOTO`, `PRICE_BASE_OTO`, `PRICE_BASE_AGIR`, `PRICE_BASE_MOTO`, `KASKO_PRICE`

**Eşleşme kodu (güvenli teslim)**
- Her talep için 4 haneli eşleşme kodu üretilir; kodu yalnızca müşteri görür (çekici ve yönetici göremez).
- Çekici “Konuma vardım” dediğinde kod girme ekranı açılır. Kod doğrulanmadan araç yüklenemez, yol yardımı başlatılamaz ve iş tamamlanamaz.
- 5 hatalı denemede kod 2 dakika kilitlenir ve müşteriye güvenlik uyarısı gider.

**Bildirimler ve izinler**
- Uygulama içi bildirim + Web Push (uygulama kapalıyken de gelir; VAPID anahtarları otomatik üretilir)
- İlk açılışta Konum, Bildirim ve Arama izin ekranı; Ayarlar’dan yönetilebilir

## Hazır indirim kodları

| Kod | Ne işe yarar |
|---|---|
| `ILK30` | İlk kurtarmaya %30 (en fazla 1.500 TL) |
| `HOSGELDIN` | Kurtarmada 250 TL indirim |
| `CEKICI20` | Çekici paketinde %20 |
| `YKDEMO` | Demo: çekici paketinin ilk ayı ücretsiz — **canlıya geçmeden yönetim panelinden kapatın** |

## Yönetici girişi

Varsayılan: telefon `05000000000`, şifre `admin1234`. Render’da `ADMIN_PHONE` ve `ADMIN_PASSWORD` ortam değişkenleriyle değiştirin.

## Ortam değişkenleri

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `PORT` | 3000 | Sunucu portu |
| `DEMO_MODE` | `true` | Gerçek çekici yokken sanal çekiciler talepleri kabul eder. Canlıda `false` yapın. |
| `SUBSCRIPTION_PRICE` | 10000 | Aylık paket ücreti (TL) |
| `JWT_SECRET` | otomatik | Oturum imzalama anahtarı |
| `ADMIN_PHONE`, `ADMIN_PASSWORD` | yukarıda | Yönetici hesabı |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | otomatik | Push bildirim anahtarları (sabitlemek için) |
| `DATABASE_URL` | — | PostgreSQL bağlantı adresi. **Canlıda zorunlu**; yoksa veriler kalıcı olmaz. |
| `DATA_DIR` | `./data` | Yerel geliştirmede veri dosyasının klasörü |
| `SUPPORT_PHONE` | 4440000 | Uygulamadaki destek hattı |
| `OFFER_RADIUS_KM` | 40 | Talebin iletileceği çekici yarıçapı |
| `MAPBOX_TOKEN` | — | Mapbox public token (`pk.` ile başlar). Harita, adres arama ve rota için. |
| `SMS_PROVIDER` | — | `netgsm` veya `twilio`. Boşsa SMS gönderilmez, doğrulama kodu ekranda gösterilir. |
| `NETGSM_USERCODE`, `NETGSM_PASSWORD`, `NETGSM_HEADER` | — | Netgsm hesap bilgileri ve onaylı SMS başlığı |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | — | Twilio bilgileri |
| `FLEET_MAX_VEHICLES` | 10 | Firma paketine dahil en fazla araç (sahip dahil) |
| `MIN_DAMAGE_PHOTOS` | 2 | Yükleme ve teslimde zorunlu en az fotoğraf |
| `GOOGLE_MAPS_API_KEY` | — | Google Maps tarayıcı anahtarı. Tanımlıysa Mapbox yerine Google kullanılır. |

Harita sağlayıcı önceliği: **Google Maps → Mapbox → OpenStreetMap**. Bir sağlayıcı hata verirse (geçersiz anahtar, kota vb.) sıradakine otomatik geçilir.

## Mapbox

`MAPBOX_TOKEN` tanımlıysa harita Mapbox Streets (koyu temada Mapbox Dark, uydu düğmesiyle Satellite Streets), adres arama Mapbox Search Box, adres bulma Mapbox Geocoding v6, rota Mapbox Directions (trafik dahil) ile çalışır. Güvenlik için [Mapbox hesabınızda](https://account.mapbox.com/access-tokens/) token'ı **URL kısıtlaması** ile yalnızca `https://yolda-kaldik.onrender.com` adresine izin verecek şekilde sınırlayın.

## Google Maps kurulumu

1. [Google Cloud Console](https://console.cloud.google.com/)’da bir proje açın ve faturalandırmayı etkinleştirin.
2. **APIs & Services → Library**’den şunları etkinleştirin: *Maps JavaScript API*, *Places API (New)*, *Geocoding API*, *Directions API*.
3. **Credentials → Create credentials → API key** ile anahtar oluşturun. Anahtarı **HTTP referrer** ile kısıtlayın: `https://yolda-kaldik.onrender.com/*` (kendi alan adınızı da ekleyin).
4. Render → servis → **Environment** bölümüne `GOOGLE_MAPS_API_KEY` olarak ekleyin.

Anahtar tanımlıysa harita Google Maps olur (sağdaki düğmeyle Harita/Uydu), adres arama Google Places’tan, rota Google Directions’tan gelir. Herhangi bir API kapalıysa o özellik otomatik olarak OpenStreetMap karşılığına düşer.

## Yerelde çalıştırma

```bash
npm install
npm start
# http://localhost:3000
```

## Canlıya geçmeden önce

- **Kalıcı veri:** `DATABASE_URL` (PostgreSQL) tanımlıysa tüm hesaplar ve kayıtlar veritabanında kalıcı tutulur. Tanımlı değilse yerel dosya kullanılır ve Render'da her yeniden başlatmada veriler silinir.
- **Ödeme:** Paket ödemesi şu an simülasyondur (kart doğrulanır ama çekim yapılmaz). `server.js` içindeki `/api/driver/subscription` noktasına iyzico / PayTR entegrasyonu bağlanmalıdır.
- **SMS doğrulama:** Kayıtta telefon numarası OTP ile doğrulanmıyor; canlıda eklenmeli.
- `DEMO_MODE=false` yapın ve `YKDEMO` kodunu kapatın.
- Google Maps anahtarı tanımlanmazsa harita CARTO/OpenStreetMap, adres arama Nominatim, rota OSRM demo sunucusundan gelir; bunlar yüksek trafik için uygun değildir.

## Teknik yapı

- `server.js` — Express + Socket.IO; REST API, gerçek zamanlı konum/durum, web push, demo çekici simülasyonu
- `src/pricing.js` — hizmetler, fiyatlandırma, indirim kodu doğrulama
- `src/db.js` — veri katmanı: PostgreSQL (JSONB) veya yerel JSON dosyası
- `public/` — müşteri (`index.html`), çekici (`cekici.html`), yönetim (`admin.html`) arayüzleri, `sw.js` service worker
