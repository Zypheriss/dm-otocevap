const { Client } = require('discord.js-selfbot-v13');
const db = require('croxydb');
const config = require('./config.json');


class DiscordSelfBot {
  constructor() {
    this.client = new Client({
      checkUpdate: false
    });
    
    this.olay_dinleyicilerini_kur();
    this.istatistikleri_baslat();
  }
  async istatistikleri_baslat() {
    if (!await db.get('istatistikler')) {
      await db.set('istatistikler', {
        toplam_mesajlar: 0,
        toplam_kullanicilar: 0,
        gunluk_mesajlar: 0,
        son_sifirlama_tarihi: new Date().toDateString(),
        kullanici_mesajlari: {}
      });
    }
  }

  olay_dinleyicilerini_kur() {
    this.client.on('ready', () => {
      console.log(`otomatik cevap başlatıldı: ${this.client.user.tag}`);
      console.log(` Sahip : ${config.zypid}`);
      console.log(` Aktif şablon: ${config.aktif_sablon}`);
      console.log(`🌙 Gece/Gündüz modu: ${config.zaman_bazli_mesajlar.aktif ? 'Açık' : 'Kapalı'}`);
      console.log('⚠️  UYARI: Self-bot kullanımı tos\'a aykırıdır hesabınız kapanabilir veya geçici olarak askıya alınabilir  bu durumdan zypheris sorumlu değildir!');
    });
    this.client.on('messageCreate', async (message) => {
      try {
        await this.mesaji_isle(message);
      } catch (error) {
        console.error(' Hata:', error.message);
      }
    });
    this.client.on('error', (error) => {
      console.error(' Discord hatası:', error.message);
    });
  }

  async mesaji_isle(message) {
    if (message.author.id === this.client.user.id) return;
    
    const kullanici_id = message.author.id;
    const kullanici_adi = message.author.tag;
    const mesaj_icerigi = message.content.trim();
    if (message.channel.type === 'DM' && kullanici_id === config.zypid && mesaj_icerigi.startsWith(config.zyprefix)) {
      await this.admin_komutunu_isle(message, mesaj_icerigi);
      return;
    }
    if (message.channel.type !== 'DM') return;
    await this.istatistikleri_guncelle(kullanici_id, kullanici_adi);
    const son_mesaj_zamani = await this.son_mesaj_zamanini_al(kullanici_id);
    const simdiki_zaman = Date.now();
    if (son_mesaj_zamani && (simdiki_zaman - son_mesaj_zamani) < config.bekleme_suresi) {
      if (config.debug) {
        const kalan_sure = Math.ceil((config.bekleme_suresi - (simdiki_zaman - son_mesaj_zamani)) / 1000 / 60);
        console.log(`⏳ ${kullanici_adi} bekleme süresinde (${kalan_sure} dakika kaldı)`);
      }
      return;
    }
    try {
      const yanit_mesaji = this.aktif_mesaji_al(kullanici_id);
      await message.reply(yanit_mesaji);
      await this.son_mesaj_zamanini_ayarla(kullanici_id, simdiki_zaman);
      
      console.log(` ${kullanici_adi} kullanıcısına yanıt gönderildi`);
      
    } catch (error) {
      console.error(' Mesaj gönderme hatası:', error.message);
    }
  }

  async admin_komutunu_isle(message, mesaj_icerigi) {
    const arglar = mesaj_icerigi.slice(config.zyprefix.length).split(' ');
    const komut = arglar[0].toLowerCase();

    try {
      switch (komut) {
        case 'istatistik':
        case 'stats':
          await this.istatistikleri_gonder(message);
          break;

        case 'sablon':
        case 'template':
          await this.sablon_komutunu_isle(message, arglar);
          break;

        case 'sablonlar':
        case 'templates':
          await this.sablonlari_listele(message);
          break;

        case 'zamanlı':
        case 'timemode':
          await this.zaman_modunu_degistir(message);
          break;

        case 'yardım':
        case 'help':
          await this.yardim_gonder(message);
          break;

        case 'sıfırla':
        case 'reset':
          await this.istatistikleri_sifirla(message);
          break;

        case 'durum':
        case 'status':
          await this.durumu_gonder(message);
          break;

        default:
          await message.reply('dostum böyle bir komutum yok  `.yardım` yazarak komutları görebilirsin.');
      }
    } catch (error) {
      await message.reply(` Komut çalıştırılırken hata: ${error.message}`);
    }
  }

  async istatistikleri_gonder(message) {
    const istatistikler = await db.get('istatistikler') || {};
    const bugun = new Date().toDateString();
    if (istatistikler.son_sifirlama_tarihi !== bugun) {
      istatistikler.gunluk_mesajlar = 0;
      istatistikler.son_sifirlama_tarihi = bugun;
      await db.set('istatistikler', istatistikler);
    }

    const en_aktif_kullanicilar = Object.entries(istatistikler.kullanici_mesajlari || {})
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([kullanici_id, sayi], index) => `${index + 1}. <@${kullanici_id}>: ${sayi} mesaj`)
      .join('\n') || 'Henüz veri yok';

    const istatistik_mesaji = ` **İSTATİSTİKLER**

 **Genel:**
• Toplam mesaj: ${istatistikler.toplam_mesajlar || 0}
• Toplam kullanıcı: ${istatistikler.toplam_kullanicilar || 0}
• Bugünkü mesajlar: ${istatistikler.gunluk_mesajlar || 0}

👥 **en çok mesaj atarak rahatsız eden ibneler:**
${en_aktif_kullanicilar}

📅 **Son güncelleme:** ${bugun}`;   // İngilizce olarak tarihi vericektir Düzeltmek isteyen düzeltebilir Uğraşmadım onun için Az bir ingilizcen vardır diye umuyorum tarihleri bilecek kadar

    await message.reply(istatistik_mesaji);
  }

  async sablon_komutunu_isle(message, arglar) {
    if (arglar.length < 2) {
      await message.reply(' Kullanım: `!sablon <şablon_adı>`\nÖrnek: `.sablon mesgul`');
      return;
    }

    const sablon_adi = arglar[1].toLowerCase();
    
    if (!config.mesaj_sablonlari[sablon_adi]) {
      await message.reply(` '${sablon_adi}' şablonu bulunamadı! \`.sablonlar\` ile mevcut şablonları görebilirsin.`);
      return;
    }

    config.aktif_sablon = sablon_adi;
    await message.reply(` Aktif şablon '${sablon_adi}' olarak değiştirildi!`);
  }

  async sablonlari_listele(message) {
    const sablonlar = Object.keys(config.mesaj_sablonlari)
      .map(ad => `• **${ad}**: ${config.mesaj_sablonlari[ad]}`)
      .join('\n');

    const sablon_mesaji = ` **MEVCUT ŞABLONLAR:**

${sablonlar}

 **Aktif şablon:** ${config.aktif_sablon}

💡 **Kullanım:** \`.sablon <şablon_adı>\``;

    await message.reply(sablon_mesaji);
  }

  async zaman_modunu_degistir(message) {
    config.zaman_bazli_mesajlar.aktif = !config.zaman_bazli_mesajlar.aktif;
    const durum = config.zaman_bazli_mesajlar.aktif ? 'açıldı' : 'kapatıldı';
    await message.reply(`🌙 Gece/Gündüz modu ${durum}!`);
  }

  async yardim_gonder(message) {
    const yardim_mesaji = ` **ADMİN KOMUTLARI**

 **İstatistikler:**
• \`.istatistik\` - İstatistikleri göster
• \`.sıfırla\` - İstatistikleri sıfırla

📝 **Şablon Yönetimi:**
• \`.sablonlar\` - Tüm şablonları listele
• \`.sablon <ad>\` - Aktif şablonu değiştir

🌙 **Zaman Modu:**
• \`.zamanlı\` - Gece/Gündüz modunu aç/kapat

ℹ️ **Diğer:**
• \`.durum\` - Bot durumunu göster
• \`.yardım\` - Bu yardım mesajını göster

⚠️ **Not:** Bu komutlar sadece admin tarafından kullanılabilir.`;

    await message.reply(yardim_mesaji);
  }

  async istatistikleri_sifirla(message) {
    await db.set('istatistikler', {
      toplam_mesajlar: 0,
      toplam_kullanicilar: 0,
      gunluk_mesajlar: 0,
      son_sifirlama_tarihi: new Date().toDateString(),
      kullanici_mesajlari: {}
    });
    await message.reply(' İstatistikler sıfırlandı!');
  }

  async durumu_gonder(message) {
    const istatistikler = await db.get('istatistikler') || {};
    const calisma_suresi = process.uptime();
    const saat = Math.floor(calisma_suresi / 3600);
    const dakika = Math.floor((calisma_suresi % 3600) / 60);

    const durum_mesaji = ` **program durumu**

 **Durum:** Aktif
 **Çalışma süresi:** ${saat}s ${dakika}d
 **Aktif şablon:** ${config.aktif_sablon}
🌙 **Zaman modu:** ${config.zaman_bazli_mesajlar.aktif ? 'Açık' : 'Kapalı'}
 **Bugünkü mesajlar:** ${istatistikler.gunluk_mesajlar || 0}
 **Bekleme süresi:** ${config.bekleme_suresi / 1000 / 60} dakika`;

    await message.reply(durum_mesaji);
  }

  aktif_mesaji_al(kullanici_id) {
    let sablon_adi = config.aktif_sablon;
    if (config.zaman_bazli_mesajlar.aktif) {
      const simdiki_saat = new Date().getHours();
      const { gece_baslangic, gece_bitis, gece_sablonu, gunduz_sablonu } = config.zaman_bazli_mesajlar;

      if (simdiki_saat >= gece_baslangic || simdiki_saat < gece_bitis) {
        sablon_adi = gece_sablonu;
      } else {
        sablon_adi = gunduz_sablonu;
      }
    }

    const sablon = config.mesaj_sablonlari[sablon_adi] || config.mesaj_sablonlari.varsayilan;
    return sablon.replace('{user}', `<@${kullanici_id}>`);
  }

  async istatistikleri_guncelle(kullanici_id, kullanici_adi) {
    const istatistikler = await db.get('istatistikler') || {
      toplam_mesajlar: 0,
      toplam_kullanicilar: 0,
      gunluk_mesajlar: 0,
      son_sifirlama_tarihi: new Date().toDateString(),
      kullanici_mesajlari: {}
    };

    const bugun = new Date().toDateString();
    if (istatistikler.son_sifirlama_tarihi !== bugun) {
      istatistikler.gunluk_mesajlar = 0;
      istatistikler.son_sifirlama_tarihi = bugun;
    }
    istatistikler.toplam_mesajlar++;
    istatistikler.gunluk_mesajlar++;
    
    if (!istatistikler.kullanici_mesajlari[kullanici_id]) {
      istatistikler.toplam_kullanicilar++;
      istatistikler.kullanici_mesajlari[kullanici_id] = 0;
    }
    istatistikler.kullanici_mesajlari[kullanici_id]++;

    await db.set('istatistikler', istatistikler);
  }

  async son_mesaj_zamanini_al(kullanici_id) {
    return await db.get(`bekleme_${kullanici_id}`);
  }

  async son_mesaj_zamanini_ayarla(kullanici_id, zaman_damgasi) {
    await db.set(`bekleme_${kullanici_id}`, zaman_damgasi);
  }
  async baslat() {
    if (!config.token || config.token === "DISCORD_USER_TOKEN_BURAYA") {
      console.error(' HATA: config.js dosyasında Discord token\'ınızı belirtmelisiniz!');
      process.exit(1);
    }

    if (!config.zypid || config.zypid === "ADMIN_USER_ID_BURAYA") {
      console.error(' HATA: config.js dosyasında admin kullanıcı ID\'sini belirtmelisiniz!');
      process.exit(1);
    }

    try {
      await this.client.login(config.token);
    } catch (error) {
      console.error(' Discord bağlantı hatası:', error.message);
      process.exit(1);
    }
  }
  async durdur() {
    console.log('🛑 dm oto cevap durduruluyorrr...');
    await this.client.destroy();
    process.exit(0);
  }
}
const selfBot = new DiscordSelfBot();
process.on('SIGINT', async () => {
  await selfBot.durdur();
});
process.on('SIGTERM', async () => {
  await selfBot.durdur();
});
selfBot.baslat().catch(console.error);