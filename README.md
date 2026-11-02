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
| `DATA_DIR` | `./data` | Veritabanı dosyasının klasörü |
| `SUPPORT_PHONE` | 4440000 | Uygulamadaki destek hattı |
| `OFFER_RADIUS_KM` | 40 | Talebin iletileceği çekici yarıçapı |

## Yerelde çalıştırma

```bash
npm install
npm start
# http://localhost:3000
```

## Canlıya geçmeden önce

- **Kalıcı veri:** Veriler `data/db.json` dosyasında tutulur. Render’ın ücretsiz planında disk kalıcı değildir; her yeniden başlatmada veriler sıfırlanır. Kalıcılık için ücretli planda bir **Persistent Disk** ekleyip `DATA_DIR`’i ona yönlendirin ya da PostgreSQL’e geçin (`src/db.js` tek noktadır).
- **Ödeme:** Paket ödemesi şu an simülasyondur (kart doğrulanır ama çekim yapılmaz). `server.js` içindeki `/api/driver/subscription` noktasına iyzico / PayTR entegrasyonu bağlanmalıdır.
- **SMS doğrulama:** Kayıtta telefon numarası OTP ile doğrulanmıyor; canlıda eklenmeli.
- `DEMO_MODE=false` yapın ve `YKDEMO` kodunu kapatın.
- Harita döşemeleri CARTO, adres arama OpenStreetMap Nominatim, rota OSRM demo sunucusundan gelir. Yüksek trafikte kendi anahtarlı servisinize (ör. Google Maps, Mapbox) geçin.

## Teknik yapı

- `server.js` — Express + Socket.IO; REST API, gerçek zamanlı konum/durum, web push, demo çekici simülasyonu
- `src/pricing.js` — hizmetler, fiyatlandırma, indirim kodu doğrulama
- `src/db.js` — JSON dosya veritabanı
- `public/` — müşteri (`index.html`), çekici (`cekici.html`), yönetim (`admin.html`) arayüzleri, `sw.js` service worker
