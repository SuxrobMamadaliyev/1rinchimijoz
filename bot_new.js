const { Telegraf, Markup, session } = require('telegraf');
require('dotenv').config();
const path = require('path');
const mongoose = require('mongoose');
const express = require('express');

// Rate limiting
const rateLimit = new Map();
const RATE_LIMIT_WINDOW = 2000; // 2 seconds
const RATE_LIMIT_MAX = 3; // Max messages per window

// Function to check rate limit
function checkRateLimit(userId) {
  const now = Date.now();
  const userTimestamps = rateLimit.get(userId) || [];
  
  // Remove timestamps older than the current window
  const recentTimestamps = userTimestamps.filter(timestamp => now - timestamp < RATE_LIMIT_WINDOW);
  
  // Check if user is over the limit
  if (recentTimestamps.length >= RATE_LIMIT_MAX) {
    return false; // Rate limited
  }
  
  // Add current timestamp and update the map
  recentTimestamps.push(now);
  rateLimit.set(userId, recentTimestamps);
  return true; // Not rate limited
}

// Function to escape MarkdownV2 special characters
function escapeMarkdownV2(text) {
  if (!text) return '';
  return String(text).replace(/[_*[\]()~`>#+\-={}.!]/g, '\\$&');
}

// Define the path to the menu image
const MENU_IMAGE = path.join(__dirname, 'menu.jpg');

// Botni yaratamiz
const bot = new Telegraf(process.env.BOT_TOKEN);

// Middleware to check rate limit and channel subscription
bot.use(async (ctx, next) => {
  try {
    // Skip if it's not a message or doesn't have a user ID
    if (!ctx.message || !ctx.from) return next();
    
    const userId = ctx.from.id;
    
    // Check rate limit
    if (!checkRateLimit(userId)) {
      console.log(`Rate limit exceeded for user ${userId}`);
      return; // Skip processing this message
    }
    
    // List of required channels (add your channel usernames here)
    const requiredChannels = ['HOLYUCSERVIS', 'starschatim'];
    
    // Check channel subscription
    for (const channel of requiredChannels) {
      try {
        const member = await ctx.telegram.getChatMember(`@${channel}`, userId);
        if (member.status === 'left' || member.status === 'kicked') {
          console.log(`User ${userId} is not subscribed to @${channel}`);
          await ctx.reply(`Iltimos, avval @${channel} kanaliga obuna bo'ling!`);
          return; // Skip processing if not subscribed
        }
      } catch (error) {
        console.error(`Error checking subscription to @${channel}:`, error);
      }
    }
    
    // Continue to the next middleware/handler
    return next();
  } catch (error) {
    console.error('Middleware error:', error);
    return next(); // Continue to next middleware even if there's an error
  }
});

// Global variables for user data
if (!global.referrals) {
  global.referrals = {}; // Store referral data
}
if (!global.existingUsers) {
  global.existingUsers = new Set(); // Track existing users
}


// Foydalanuvchi ma'lumotlarini saqlash funksiyasi
async function saveUserInfo(userData) {
  try {
    const user = await User.findOneAndUpdate(
      { id: userData.id },
      {
        $set: {
          username: userData.username || '',
          first_name: userData.first_name || '',
          last_name: userData.last_name || '',
          language_code: userData.language_code || '',
          last_seen: new Date()
        },
        $setOnInsert: {
          is_bot: userData.is_bot || false,
          join_date: new Date(),
          balance: 0
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return user;
  } catch (error) {
    console.error('Error saving user info:', error);
    return null;
  }
}

// User Schema for MongoDB
const UserSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  username: { type: String, default: '' },
  first_name: { type: String, default: '' },
  last_name: { type: String, default: '' },
  language_code: { type: String, default: '' },
  is_bot: { type: Boolean, default: false },
  join_date: { type: Date, default: Date.now },
  balance: { type: Number, default: 0 },
  last_seen: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('MongoDB connected successfully');
}).catch(err => {
  console.error('MongoDB connection error:', err);
  process.exit(1);
});

// Start komandasi
bot.start(async (ctx) => {
  try {
    // Foydalanuvchi ma'lumotlarini saqlash
    saveUserInfo(ctx.from);
    
    // Referral link orqali kelgan bo'lsa, uni qayta ishlash
    await handleReferral(ctx);
    
    // Asosiy menyuni ko'rsatish
    await sendMainMenu(ctx);
  } catch (error) {
    console.error('Start command error:', error);
    await ctx.reply('Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
  }
});

// Referral bonus amount
const REFERRAL_BONUS = 100; // 100 so'm for each successful referral

// --- Almaz narxlari (asosiy + bonus) ---
const ALMAZ_PRICES = {
  '100+80': 14000,       // 100 + 80 diamantes
  '310+249': 41000,      // 310 + 249 diamantes
  '520+416': 72000,      // 520 + 416 diamantes
  '1060+848': 144000,    // 1060 + 848 diamantes
  '2180+1853': 274000,   // 2180 + 1853 diamantes
  '5600+4760': 719000    // 5600 + 4760 diamantes
};

// --- PUBG Mobile UC narxlari (kengaytirilgan) ---
const UC_PRICES = {
  '60': 12000,
  '120': 24000,
  '180': 36000,
  '325': 58000,
  '385': 70000,
  '445': 82000,
  '660': 114000,
  '720': 125000,
  '985': 170000,
  '1320': 228000,
  '1800': 285000,
  '2125': 345000,
  '2460': 400000,
  '2785': 460000,
  '3850': 555000,
  '4175': 610000,
  '4510': 670000,
  '5650': 855000,
  '8100': 1100000,
  '9900': 1385000,
  '11950': 1660000,
  '16200': 2200000
};

// --- PUBG Mobile PP narxlari (kengaytirilgan) ---
const PP_PRICES = {
  '1000': 2520,
  '3000': 7560,
  '5000': 12600,
  '10000': 25200,
  '20000': 50400,
  '50000': 116676,
  '100000': 235242
};

// Session middleware barcha sozlamalar uchun
bot.use(session({
  defaultSession: () => ({
    // Almaz sotib olish uchun
    almax: { step: null, amount: null },
    // Balans to'ldirish uchun
    topup: { step: null, amount: null },
    // Buyurtma uchun
    buying: null,
    // Promokodlar uchun
    awaitingPromo: false,
    awaitingNewPromo: false,
    awaitingFindUser: false,
    awaitingBroadcast: false
  })
}));

// --- Almaz sotib olish bosqichlari ---
bot.action('buy:almaz', async (ctx) => {
  ctx.session.almaz = { step: 'amount' };
  
  // Create buttons for each diamond package
  const keyboard = [];
  
  // Add buttons for each diamond package in ALMAZ_PRICES
  for (const [packageName, price] of Object.entries(ALMAZ_PRICES)) {
    keyboard.push([
      Markup.button.callback(
        `${packageName} Almaz - ${price.toLocaleString()} so'm`,
        `almaz:amount:${packageName}`
      )
    ]);
  }
  
  // Add back button
  keyboard.push([Markup.button.callback('⬅️ Orqaga', 'back:main')]);
  
  await sendOrUpdateMenu(ctx, 'Qancha Almaz sotib olmoqchisiz?', keyboard);
});

bot.action(/almaz:amount:(.+)/, async (ctx) => {
  const packageName = ctx.match[1];
  const userId = ctx.from.id;
  const price = ALMAZ_PRICES[packageName];
  
  if (!price) {
    await ctx.answerCbQuery('❌ Xatolik: Bunday paket topilmadi');
    return;
  }
  
  const userBalance = await getUserBalance(userId);
  if (userBalance < price) {
    await sendOrUpdateMenu(
      ctx,
      `❌ Mablag' yetarli emas!\n\n💳 Balans: ${userBalance.toLocaleString()} so'm\n💰 Kerak: ${price.toLocaleString()} so'm\n\nBalansingizni to'ldiring va qayta urinib ko'ring.`,
      [
        [Markup.button.callback('💳 Balansni to\'ldirish', 'topup:amount')],
        [Markup.button.callback('⬅️ Orqaga', 'back:main')]
      ]
    );
    delete ctx.session.almaz;
    return;
  }
  ctx.session.almaz = { step: 'uid', amount };
  await sendOrUpdateMenu(ctx, `Free Fire ID raqamingizni kiriting:\n\nMasalan: 123456789`, [
    [Markup.button.callback('⬅️ Orqaga', 'back:main')]
  ]);
});

// UID va balans tekshirish
bot.on('text', async (ctx, next) => {
  if (ctx.session.almaz && ctx.session.almaz.step === 'uid') {
    const uid = ctx.message.text.trim();
    const amount = ctx.session.almaz.amount;
    const price = ALMAZ_PRICES[amount];
    const userId = ctx.from.id;
    if (!/^[0-9]{5,}$/.test(uid)) {
      await ctx.reply('❌ Iltimos, to\'g\'ri Free Fire ID raqamini kiriting!');
      return;
    }
    // Adminlarga buyurtma yuborish
    const orderId = generateOrderId();
    ctx.session.almaz = undefined;
    pendingOrders[orderId] = { userId, type: 'almaz', amount, uid, price };
    const adminMessage = `💎 *Yangi Almaz buyurtma*\n` +
      `🆔 Buyurtma ID: ${orderId}\n` +
      `💎 Miqdor: ${amount} Almaz\n` +
      `🎮 UID: ${uid}\n` +
      `💰 Summa: ${price.toLocaleString()} so'm\n` +
      `👤 Foydalanuvchi: ${ctx.from.username || ctx.from.first_name || userId} (ID: ${userId})`;
    const adminKeyboard = [
      [
        Markup.button.callback('✅ Tasdiqlash', `confirm_almaz:${orderId}`),
        Markup.button.callback('❌ Bekor qilish', `cancel_order:${orderId}`)
      ]
    ];
    for (const adminId of ADMIN_IDS) {
      try {
        await ctx.telegram.sendMessage(
          adminId,
          adminMessage,
          { parse_mode: 'Markdown', reply_markup: { inline_keyboard: adminKeyboard } }
        );
      } catch (e) {}
    }
    await ctx.reply(`✅ Buyurtmangiz qabul qilindi!\n\n💎 Miqdor: ${amount} Almaz\n🎮 UID: ${uid}\n💰 Summa: ${price.toLocaleString()} so'm\n\nTez orada admin tasdiqlaydi.`);
    return;
  }
  return next();
});

// Admin tasdiqlasa balansdan pul yechish
bot.action(/confirm_almaz:(\w+)/, async (ctx) => {
  if (!isAdmin(ctx)) {
    await ctx.answerCbQuery('Ruxsat yo\'q!');
    return;
  }
  const orderId = ctx.match[1];
  const order = pendingOrders[orderId];
  if (!order || order.type !== 'almaz') {
    await ctx.answerCbQuery('Buyurtma topilmadi!');
    return;
  }
  const { userId, amount, uid, price } = order;
  const userBalance = await getUserBalance(userId);
  if (userBalance < price) {
    await ctx.reply(`❌ Foydalanuvchida yetarli mablag' yo'q. Balans: ${userBalance.toLocaleString()} so'm, kerak: ${price.toLocaleString()} so'm`);
    return;
  }
  await updateUserBalance(userId, -price);
  delete pendingOrders[orderId];
  await ctx.answerCbQuery('✅ Buyurtma tasdiqlandi!');
  await ctx.editMessageText(`${ctx.update.callback_query.message.text}\n\n✅ *Tasdiqlandi*`);
  try {
    await ctx.telegram.sendMessage(
      userId,
      `✅ Buyurtmangiz tasdiqlandi!\n\n💎 ${amount} Almaz tez orada UID: ${uid} ga tushiriladi.`
    );
  } catch (e) {}
});

// Kanal ma'lumotlari
const CHANNELS = [
  {
    username: process.env.CHANNEL_1_USERNAME?.replace('@', '') || 'channel1', // @ belgisini olib tashlaymiz
    link: process.env.CHANNEL_1_LINK || 'https://t.me/channel1'
  },
  {
    username: process.env.CHANNEL_2_USERNAME?.replace('@', '') || 'channel2', // @ belgisini olib tashlaymiz
    link: process.env.CHANNEL_2_LINK || 'https://t.me/channel2'
  }
];

// Xabarlarni boshqarish uchun asosiy funksiya
async function sendOrUpdateMenu(ctx, caption, keyboard) {
  const greeting = `Assalomu alaykum, ${ctx.from?.first_name || 'foydalanuvchi'}!\n\n`;
  
  try {
    // Loading animatsiyasini to'xtatish
    if (ctx.callbackQuery) {
      try {
        await ctx.answerCbQuery();
      } catch (e) {
        console.log('answerCbQuery xatoligi:', e.message);
      }
      
      // Agar asosiy menyu bo'lsa
      if (caption === 'Bo\'limni tanlang:') {
        try {
          // Avvalgi xabarni o'chirishga harakat qilamiz
          try {
            await ctx.deleteMessage();
          } catch (e) {
            console.log('Xabarni o\'chirib bo\'lmadi, yangi xabar yuborilmoqda...');
          }
          
          // Rasm bilan yangi xabar yuborishga harakat qilamiz
          try {
            // Convert to absolute path
            const absolutePath = path.resolve(MENU_IMAGE);
            console.log('Trying to send image from:', absolutePath);
            
            // Check if file exists
            if (!fs.existsSync(absolutePath)) {
              console.error('Rasm fayli topilmadi:', absolutePath);
              throw new Error(`Rasm fayli topilmadi: ${absolutePath}`);
            }
            
            console.log('Rasm fayli mavjud, yuborilmoqda...');
            
            // Send photo with direct file path
            try {
              console.log('Attempting to send photo...');
              await ctx.replyWithPhoto(
                { source: fs.createReadStream(absolutePath) },
                {
                  caption: greeting + caption,
                  ...Markup.inlineKeyboard(keyboard),
                  parse_mode: 'Markdown'
                }
              );
              console.log('Rasm muvaffaqiyatli yuborildi');
              return;
            } catch (sendError) {
              console.error('Error sending photo:', sendError);
              console.error('Error details:', {
                message: sendError.message,
                stack: sendError.stack,
                response: sendError.response?.data || 'No response data'
              });
              throw sendError; // Re-throw to be caught by the outer catch
            }
          } catch (photoError) {
            console.error('Rasm bilan xabar yuborishda xatolik:', photoError);
            // Rasm bilan yuborib bo'lmasa, oddiy xabar sifatida yuborishga harakat qilamiz
            await ctx.reply(greeting + caption, {
              ...Markup.inlineKeyboard(keyboard),
              parse_mode: 'Markdown'
            });
          }
        } catch (error) {
          console.error('Asosiy menyu yuborishda xatolik:', error);
          // Xatolik yuz bersa, oddiy xabar sifatida yuborishga harakat qilamiz
          try {
            await ctx.reply(greeting + caption, {
              ...Markup.inlineKeyboard(keyboard),
              parse_mode: 'Markdown'
            });
          } catch (e) {
            console.error('Alternativ xabar yuborishda xatolik:', e);
          }
        }
      } else {
        // Try to handle message editing or sending new message
        const message = ctx.callbackQuery?.message;
        const messageId = message?.message_id;
        const chatId = ctx.chat?.id || message?.chat?.id;
        
        // Check if we can edit this message (it must have text and be in a chat where we can edit messages)
        const canEditMessage = messageId && chatId && 
                             (message?.text || message?.caption) && 
                             !message?.photo; // Don't try to edit photo captions
        
        // First try to edit the existing message if possible
        if (canEditMessage) {
          try {
            await ctx.telegram.editMessageText(
              chatId,
              messageId,
              null, // inline_message_id
              caption,
              {
                reply_markup: Markup.inlineKeyboard(keyboard).reply_markup,
                parse_mode: 'Markdown'
              }
            );
            return; // Successfully edited, we're done
          } catch (editError) {
            console.error('Xabarni tahrirlashda xatolik:', editError.message);
            // Continue to fallback method
          }
        }
        
        // If we can't edit, try to delete the old message and send a new one
        try {
          // Try to delete the old message if it exists
          if (messageId) {
            try { 
              await ctx.telegram.deleteMessage(chatId, messageId);
            } catch (deleteError) {
              console.log('Eski xabarni o\'chirib bo\'lmadi:', deleteError.message);
              // Continue even if delete fails
            }
          }
          
          // Try to send a new message with full formatting
          try {
            await ctx.reply(caption, {
              reply_markup: Markup.inlineKeyboard(keyboard).reply_markup,
              parse_mode: 'Markdown'
            });
          } catch (replyError) {
            console.error('Formatlangan xabar yuborishda xatolik:', replyError);
            
            // If that fails, try sending just the text with keyboard
            try {
              await ctx.reply(caption, Markup.inlineKeyboard(keyboard));
            } catch (simpleError) {
              console.error('Oddiy xabar yuborishda ham xatolik:', simpleError);
              
              // Last resort: try to send just the text
              try {
                await ctx.reply(caption);
              } catch (finalError) {
                console.error('Faqat matn yuborishda ham xatolik:', finalError);
              }
            }
          }
        } catch (mainError) {
          console.error('Xabar yuborishda asosiy xatolik:', mainError);
        }
      }
    } else {
      // Yangi suhbat boshlanganda
      if (caption === 'Bo\'limni tanlang:') {
        try {
          const greeting = `Assalomu alaykum, ${ctx.from.first_name || 'foydalanuvchi'}!\n\n`;
          const absolutePath = path.resolve(MENU_IMAGE);
          console.log('Trying to send image from (second instance):', absolutePath);
          
          // Check if file exists
          if (!fs.existsSync(absolutePath)) {
            console.error('Rasm fayli topilmadi (second instance):', absolutePath);
            throw new Error(`Rasm fayli topilmadi: ${absolutePath}`);
          }
          
          console.log('Rasm fayli mavjud, yuborilmoqda (second instance)...');
          
          try {
            await ctx.replyWithPhoto(
              { source: absolutePath },
              {
                caption: greeting + caption,
                ...Markup.inlineKeyboard(keyboard),
                parse_mode: 'Markdown'
              }
            );
          } catch (error) {
            console.error('Rasm yuborishda xatolik (second instance):', error);
            throw error; // Re-throw to be caught by the outer catch block
          }
        } catch (error) {
          console.error('Rasm yuklanmadi:', error);
          await ctx.reply(caption, Markup.inlineKeyboard(keyboard));
        }
      } else {
        await ctx.reply(caption, Markup.inlineKeyboard(keyboard));
      }
    }
  } catch (error) {
    console.error('Xatolik yuz berdi:', error);
    try {
      // Last resort: try to send a simple message
      await ctx.reply(caption);
    } catch (e) {
      console.error('Xabar yuborib bo\'lmadi:', e);
    }
  }
} // End of sendOrUpdateMenu function

// Asosiy menyuda ko'rinadigan tugmalar nomlari
const MAIN_MENU = [
  'Hisobim',
  'TG Premium & Stars',
  'PUBG Mobile UC / PP',
  'UC Shop',
  'SOS',
  'Promokod',
  'Admen paneli',
];

// User balances and referral system are now initialized at the top of the file

// /start yoki asosiy menyu ko'rsatish
async function sendMainMenu(ctx) {
  // Asosiy menyu tugmalarini yaratamiz
  try {
    // Avval obunani tekshirish
    const checkResult = await checkUserSubscription(ctx);
    
    // Agar obuna bo'lmagan bo'lsa yoki bot kanalga kira olmasa, obuna bo'lish sahifasiga yo'naltiramiz
    if (!checkResult.subscribed || checkResult.hasAccessError) {
      return await sendSubscriptionMessage(ctx, checkResult);
    }
    
    // Agar obuna bo'lgan bo'lsa, asosiy menyuni ko'rsatamiz
    const menuItems = [...MAIN_MENU]; // Asl massivni o'zgartirmaslik uchun nusxalaymiz
  
    // Admin panelini faqat adminlar uchun ko'rsatamiz
    if (!isAdmin(ctx)) {
      const adminIndex = menuItems.indexOf('Admen paneli');
      if (adminIndex > -1) {
        menuItems.splice(adminIndex, 1);
      }
    }
    
    const keyboard = menuItems.map((text) => {
      if (text === 'UC Shop') {
        return [Markup.button.url(text, UC_CHANNEL_URL)];
      }
      return [Markup.button.callback(text, `menu:${text}`)];
    });
    
    // Agar obuna bo'lmagan bo'lsa, tekshirish tugmasini qo'shamiz
    if (!checkResult.subscribed) {
      keyboard.push([Markup.button.callback('✅ Obunani tekshirish', 'check_subscription')]);
    }
    
    // Always send a new message instead of editing to avoid message editing issues
    try {
      // Try to delete any existing message first
      try {
        if (ctx.callbackQuery) {
          await ctx.deleteMessage();
        }
      } catch (e) {
        // Ignore if we can't delete the old message
      }
      
      // Send menu image with the main menu
      try {
        await ctx.replyWithPhoto({
          source: fs.createReadStream(MENU_IMAGE)
        }, {
          caption: 'Bo\'limni tanlang:',
          reply_markup: {
            inline_keyboard: keyboard
          },
          parse_mode: 'Markdown'
        });
      } catch (photoError) {
        console.error('Rasm yuborishda xatolik:', photoError);
        // If image sending fails, send text menu as fallback
        await ctx.reply('Bo\'limni tanlang:', {
          reply_markup: {
            inline_keyboard: keyboard
          },
          parse_mode: 'Markdown'
        });
      }
    } catch (error) {
      console.error('Error sending main menu:', error);
      // Fallback to a simple message if there's an error
      await ctx.reply('Iltimos, asosiy menyuni qayta yuklash uchun /start buyrug\'ini bosing.');
    }
  } catch (error) {
    console.error('sendMainMenu xatosi:', error);
    await ctx.reply('Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
  }
};



bot.start((ctx) => {
  try {
    // Add user to our tracking set
    if (ctx.from && ctx.from.id) {
      global.botUsers.add(ctx.from.id);
      // Save user information
      saveUserInfo(ctx.from);
    }
    
    // Handle referral link if present
    handleReferral(ctx);
    
    // Show main menu
    sendMainMenu(ctx);
  } catch (error) {
    console.error('Error in start command:', error);
    ctx.reply('Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
  }
});

// Inline tugma bosilganda
bot.action(/menu:(.+)/, async (ctx) => {
  const selection = ctx.match[1];

  switch (selection) {
    case 'Pul ishlash': {
      await ctx.answerCbQuery();
      // Referral link and stats
      const userId = ctx.from.id;
      const username = ctx.from.username || ctx.from.first_name || 'foydalanuvchi';
      // Hardcode bot username for short referral link
      const referralLink = `https://t.me/Group_Guard_xizmat_Bot?start=ref${userId}`;
      
      // Since we're not tracking referrals anymore, we'll show 0
      // In a real implementation, you might want to track this in users.json
      const referralCount = 0;
      
      const totalEarned = referralCount * REFERRAL_BONUS;
      const message = `💰 *Pul ishlash* 💰\n\n` +
        `🔗 Sizning referal havolangiz:\n\`${referralLink}\`\n\n` +
        `👥 Sizning takliflaringiz: *${referralCount} ta*\n` +
        `💵 Jami ishlagan pulingiz: *${totalEarned} so'm*\n\n` +
        `📢 Do'stlaringizni taklif qiling va har bir taklif uchun *${REFERRAL_BONUS} so'm* oling!\n` +
        `Ular ham siz kabi pul ishlashni boshlaydilar!`;
      const keyboard = [
        [Markup.button.switchToChat('📤 Do\'stlarni taklif qilish', referralLink)],
        [Markup.button.callback('⬅️ Orqaga', 'back:main')]
      ];
      await ctx.reply(message, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(keyboard) });
      break;
    }

    case 'Hisobim':
      await sendAccountMenu(ctx);
      break;
    case 'TG Premium & Stars':
      // Avval asosiy menyuni ko'rsatamiz
      const mainKeyboard = [
        [Markup.button.callback('📱 Telegram Premium', 'premium:select')],
        [Markup.button.callback('⭐ Telegram Stars', 'stars:select')],
        [Markup.button.callback('⬅️ Orqaga', 'back:main')]
      ];
      await sendOrUpdateMenu(ctx, 'Qaysi xizmatni sotib olmoqchisiz?', mainKeyboard);
      break;
    case 'Free Fire Almaz': {
      await ctx.answerCbQuery();
      const price100 = ALMAZ_PRICES[100]?.toLocaleString() || 'Nomaʼlum';
      const keyboard = [
        [Markup.button.callback(`💎 Almaz sotib olish (100 Almaz - ${price100} so'm)`, 'buy:almaz')],
        [Markup.button.callback('⬅️ Orqaga', 'back:main')]
      ];
      await sendOrUpdateMenu(ctx, "💎 Almaz sotib olish bo'limi:", keyboard);
      break;
    }
    case 'PUBG Mobile UC / PP': {
      await ctx.answerCbQuery();
      const keyboard = [
        [Markup.button.callback('UC sotib olish', 'pubg:buy_uc')],
        [Markup.button.callback('PP sotib olish', 'pubg:buy_pp')],
        [Markup.button.callback('⬅️ Orqaga', 'back:main')]
      ];
      await sendOrUpdateMenu(ctx, "PUBG Mobile UC / PP bo'limi:", keyboard);
      break;
    }
    case 'UC Shop':
      await sendUCShop(ctx);
      break;
    case 'SOS':
      await sendSOS(ctx);
      break;
    case 'Promokod':
      await promptPromokod(ctx);
      break;
    case 'Admen paneli':
      if (isAdmin(ctx)) {
        await sendAdminPanel(ctx);
      } else {
        await ctx.answerCbQuery('Ruxsat yo\'q!');
      }
      break;
    default:
      await ctx.answerCbQuery('Ushbu bo\'lim hozircha mavjud emas');
  }
});

// PUBG Mobile UC sotib olish bosqichi
bot.action('pubg:buy_uc', async (ctx) => {
  await sendUcMenu(ctx);
});

// PUBG Mobile PP sotib olish bosqichi
bot.action('pubg:buy_pp', async (ctx) => {
  await sendPpMenu(ctx);
});

// UC paketini tanlash
bot.action(/pubg:uc:(\d+):(\d+)/, async (ctx) => {
  try {
    const userId = ctx.from.id;
    const userBalance = await getUserBalance(userId);
    const amount = ctx.match[1];
    const price = parseInt(ctx.match[2]);
    
    // Check if user still has enough balance
    if (userBalance < price) {
      const neededAmount = price - userBalance;
      const minUcPrice = Math.min(...Object.values(UC_PRICES));
      
      const keyboard = [
        [Markup.button.callback('💳 Hisobni to\'ldirish', 'topup:amount')],
        [Markup.button.callback('⬅️ Orqaga', 'back:pubg')]
      ];
      
      return sendOrUpdateMenu(
        ctx,
        `⚠️ *Hisobingizda yetarli mablag' mavjud emas!*\n\n` +
        `💳 Sizning balansingiz: *${userBalance.toLocaleString()} so'm*\n` +
        `💰 Tanlangan paket narxi: *${price.toLocaleString()} so'm*\n` +
        `💵 Yetishmayotgan summa: *${neededAmount.toLocaleString()} so'm*\n\n` +
        `ℹ Eng arzon UC paketi: *${minUcPrice.toLocaleString()} so'm*\n` +
        `💡 Iltimos, hisobingizni to'ldiring yoki kichikroq miqdor tanlang.`,
        keyboard
      );
    }
    
    // If balance is sufficient, proceed with purchase
    ctx.session.buying = { type: 'pubg_uc', amount, price };
    
    await sendOrUpdateMenu(
      ctx,
      `💎 *${amount} UC* sotib olish uchun o'yindagi foydalanuvchi nomingizni yuboring:\n\n` +
      `💳 To'lov miqdori: *${price.toLocaleString()} so'm*\n` +
      `💰 Sizning balansingiz: *${userBalance.toLocaleString()} so'm*\n` +
      `📦 Miqdor: *${amount} UC*\n\n` +
      `ℹ Iltimos, o'yindagi to'liq foydalanuvchi nomingizni yozing.`,
      [[Markup.button.callback('⬅️ Orqaga', 'pubg:buy_uc')]]
    );
  } catch (error) {
    console.error('UC paketini tanlashda xatolik:', error);
    await ctx.reply('⚠️ Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
    return sendPubgMenu(ctx);
  }
});

// PP paketini tanlash
bot.action(/pubg:pp:(\d+):(\d+)/, async (ctx) => {
  try {
    const userId = ctx.from.id;
    const userBalance = await getUserBalance(userId);
    const amount = ctx.match[1];
    const price = parseInt(ctx.match[2]);
    
    // Check if user still has enough balance
    if (userBalance < price) {
      const neededAmount = price - userBalance;
      const minPpPrice = Math.min(...Object.values(PP_PRICES));
      
      const keyboard = [
        [Markup.button.callback('💳 Hisobni to\'ldirish', 'topup:amount')],
        [Markup.button.callback('⬅️ Orqaga', 'back:pubg')]
      ];
      
      return sendOrUpdateMenu(
        ctx,
        `⚠️ *Hisobingizda yetarli mablag' mavjud emas!*\n\n` +
        `💳 Sizning balansingiz: *${userBalance.toLocaleString()} so'm*\n` +
        `💰 Tanlangan paket narxi: *${price.toLocaleString()} so'm*\n` +
        `💵 Yetishmayotgan summa: *${neededAmount.toLocaleString()} so'm*\n\n` +
        `ℹ Eng arzon PP paketi: *${minPpPrice.toLocaleString()} so'm*\n` +
        `💡 Iltimos, hisobingizni to'ldiring yoki kichikroq miqdor tanlang.`,
        keyboard
      );
    }
    
    // If balance is sufficient, proceed with purchase
    ctx.session.buying = { type: 'pubg_pp', amount, price };
    
    await sendOrUpdateMenu(
      ctx,
      `⭐ *${amount} PP* sotib olish uchun o'yindagi foydalanuvchi nomingizni yuboring:\n\n` +
      `💳 To'lov miqdori: *${price.toLocaleString()} so'm*\n` +
      `💰 Sizning balansingiz: *${userBalance.toLocaleString()} so'm*\n` +
      `📦 Miqdor: *${amount} PP*\n\n` +
      `ℹ Iltimos, o'yindagi to'liq foydalanuvchi nomingizni yozing.`,
      [[Markup.button.callback('⬅️ Orqaga', 'pubg:buy_pp')]]
    );
  } catch (error) {
    console.error('PP paketini tanlashda xatolik:', error);
    await ctx.answerCbQuery('Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
  }
});

// Add channel flow
bot.action('admin:addChannel', async (ctx) => {
  if (!isAdmin(ctx)) {
    await ctx.answerCbQuery('Ruxsat yo\'q!');
    return;
  }
  
  if (!ctx.session) ctx.session = {};
  ctx.session.channelAction = 'add';
  
  await ctx.editMessageText(
    '📢 *Yangi kanal qo\'shish*\n\n' +
    'Kanal username va linkini quyidagi formatda yuboring:\n' +
    '`@kanal_username https://t.me/kanal_link`\n\n' +
    'Misol uchun:\n' +
    '`@mychannel https://t.me/mychannel`\n\n' +
    '❕ *Eslatma:* Kanal usernamesi @ bilan boshlanishi kerak!',
    {
      reply_markup: {
        inline_keyboard: [
          [Markup.button.callback('◀️ Orqaga', 'admin:channelMenu')]
        ]
      },
      parse_mode: 'Markdown'
    }
  );
});


function sendPubgMenu(ctx) {
  const keyboard = [
    [Markup.button.callback('💎 UC Sotib Olish', 'pubg:buy_uc')],
    [Markup.button.callback('⭐ PP Sotib Olish', 'pubg:buy_pp')],
    [Markup.button.callback('⬅️ Orqaga', 'back:main')]
  ];
  return sendOrUpdateMenu(ctx, '🎮 PUBG Mobile - Xizmatlar', keyboard);
}

// UC sotib olish menyusi
async function sendUcMenu(ctx, customMessage = '') {
  const userId = ctx.from.id;
  const userBalance = await getUserBalance(userId);
  
  // Show all packages without balance check
  const keyboard = [];
  
  for (const [uc, price] of Object.entries(UC_PRICES)) {
    const buttonText = `${uc} UC - ${price.toLocaleString()} so'm`;
    
    keyboard.push([
      Markup.button.callback(
        buttonText,
        `pubg:uc:${uc}:${price}`
      )
    ]);
  }
  
  // Add back button
  keyboard.push([
    Markup.button.callback('⬅️ Orqaga', 'back:pubg')
  ]);
  
  // Prepare the message
  let message = `💎 UC Sotib Olish\n\n`;
  message += `💳 UC paketlaridan birini tanlang:`;
  
  return sendOrUpdateMenu(ctx, message, keyboard);
}

// PP sotib olish menyusi
async function sendPpMenu(ctx, customMessage = '') {
  const userId = ctx.from.id;
  const userBalance = await getUserBalance(userId);
  
  // Show all packages without balance check
  const keyboard = [];
  
  for (const [pp, price] of Object.entries(PP_PRICES)) {
    const buttonText = `${pp} PP - ${price.toLocaleString()} so'm`;
    
    keyboard.push([
      Markup.button.callback(
        buttonText,
        `pubg:pp:${pp}:${price}`
      )
    ]);
  }
  
  // Add top-up and back buttons
  keyboard.push([
    Markup.button.callback('💳 Hisobni to\'ldirish', 'topup:amount')
  ]);
  keyboard.push([
    Markup.button.callback('⬅️ Orqaga', 'back:pubg')
  ]);
  
  // Prepare the message
  let message = `⭐ PP Sotib Olish\n\n`;
  message += `💰 Sizning balansingiz: *${userBalance.toLocaleString()} so'm*\n`;
  message += `💳 PP paketlaridan birini tanlang:`;
  
  // Add custom message if provided (like insufficient balance message)
  if (customMessage) {
    message = customMessage + '\n\n' + message;
  }
  
  return sendOrUpdateMenu(ctx, message, keyboard);
}

// Premium yoki Stars tanlash
// Premium narxlarini ko'rsatamiz
bot.action('premium:select', async (ctx) => {
  const keyboard = [
    // Premium narxlari
    [Markup.button.callback(`📱 1 oy - ${PREMIUM_PRICES[1].toLocaleString()} so'm`, `buy:premium:1:${PREMIUM_PRICES[1]}`)],
    [Markup.button.callback(`📱 3 oy - ${PREMIUM_PRICES[3].toLocaleString()} so'm`, `buy:premium:3:${PREMIUM_PRICES[3]}`)],
    [Markup.button.callback(`📱 6 oy - ${PREMIUM_PRICES[6].toLocaleString()} so'm`, `buy:premium:6:${PREMIUM_PRICES[6]}`)],
    [Markup.button.callback(`📱 12 oy - ${PREMIUM_PRICES[12].toLocaleString()} so'm`, `buy:premium:12:${PREMIUM_PRICES[12]}`)],
    // Orqaga tugmasi
    [Markup.button.callback('⬅️ Orqaga', 'back:premium_stars')]
  ];
  await sendOrUpdateMenu(ctx, '📱 Telegram Premium narxlari:', keyboard);
});

// Stars narxlarini ko'rsatamiz
bot.action('stars:select', async (ctx) => {
  const keyboard = [
    // Stars narxlari
    [Markup.button.callback(`⭐ 15 Stars - ${STARS_PRICES[15].toLocaleString()} so'm`, `buy:stars:15:${STARS_PRICES[15]}`)],
    [Markup.button.callback(`⭐ 25 Stars - ${STARS_PRICES[25].toLocaleString()} so'm`, `buy:stars:25:${STARS_PRICES[25]}`)],
    [Markup.button.callback(`⭐ 50 Stars - ${STARS_PRICES[50].toLocaleString()} so'm`, `buy:stars:50:${STARS_PRICES[50]}`)],
    [Markup.button.callback(`⭐ 100 Stars - ${STARS_PRICES[100].toLocaleString()} so'm`, `buy:stars:100:${STARS_PRICES[100]}`)],
    [Markup.button.callback(`⭐ 150 Stars - ${STARS_PRICES[150].toLocaleString()} so'm`, `buy:stars:150:${STARS_PRICES[150]}`)],
    [Markup.button.callback(`⭐ 200 Stars - ${STARS_PRICES[200].toLocaleString()} so'm`, `buy:stars:200:${STARS_PRICES[200]}`)],
    [Markup.button.callback(`⭐ 300 Stars - ${STARS_PRICES[300].toLocaleString()} so'm`, `buy:stars:300:${STARS_PRICES[300]}`)],
    // Orqaga tugmasi
    [Markup.button.callback('⬅️ Orqaga', 'back:premium_stars')]
  ];
  await sendOrUpdateMenu(ctx, '⭐ Telegram Stars narxlari:', keyboard);
});

// Hisobim kichik menyusi
async function sendAccountMenu(ctx) {
  const userId = ctx.from.id;
  const balance = await getUserBalance(ctx.from.id);
  
  const keyboard = [
    [Markup.button.callback('💰 Balansni to\'ldirish', 'topup:amount')],
    [Markup.button.callback('⬅️ Orqaga', 'back:main')]
  ];
  await sendOrUpdateMenu(ctx, `💳 Balansingiz: ${balance.toLocaleString()} so'm`, keyboard);
  await ctx.answerCbQuery();
}

// --- Sozlamalar ---
const UC_CHANNEL_URL = 'https://t.me/HOLYUCSERVIS';
const ADMIN_USER = '@d1yor_salee';
const ADMIN_IDS = [process.env.ADMIN_ID1, process.env.ADMIN_ID2].filter(Boolean).map(Number); // admin ID lari

// Ensure ADMIN_IDS has valid values
if (ADMIN_IDS.length === 0) {
  console.warn('⚠️ No valid admin IDs found. Please set ADMIN_ID1 and ADMIN_ID2 in .env file');
} else {
  console.log(`✅ Admin IDs loaded: ${ADMIN_IDS.join(', ')}`);
}

// Escape special characters for MarkdownV2
function escapeMarkdown(text) {
  if (!text) return '';
  return text.toString()
    .replace(/[_*[\]()~`>#+\-={}.!]/g, '\\$&');
}

// Track all users who have started the bot
if (!global.botUsers) {
  global.botUsers = new Set();
}

// Track users who have used the bot before (for referral system)
if (!global.existingUsers) {
  global.existingUsers = new Set();
}

// Store referral bonuses (referrerId -> [referredUserIds])
if (!global.referrals) {
  global.referrals = {};
}

// Premium va Stars narxlari
const PREMIUM_PRICES = {
  1: 43000,   // 1 oy - 43,000 so'm
  3: 152000,  // 3 oy - 152,000 so'm
  6: 222000,  // 6 oy - 222,000 so'm
  12: 320000  // 12 oy - 320,000 so'm
};

const STARS_PRICES = {
  15: 3500,    // 15 stars - 3,500 so'm
  25: 6000,    // 25 stars - 6,000 so'm
  50: 12000,   // 50 stars - 12,000 so'm
  100: 22000,  // 100 stars - 22,000 so'm
  150: 31000,  // 150 stars - 31,000 so'm
  200: 43000,  // 200 stars - 43,000 so'm
  300: 63000   // 300 stars - 63,000 so'm
};

// Debug: Check if image exists on startup
try {
  console.log('Image path:', MENU_IMAGE);
  if (fs.existsSync(MENU_IMAGE)) {
    console.log('Image file exists and is accessible');
    console.log('File stats:', fs.statSync(MENU_IMAGE));
  } else {
    console.error('Image file does not exist at path:', MENU_IMAGE);
    console.log('Current working directory:', process.cwd());
    console.log('Directory contents:', fs.readdirSync(__dirname));
  }
} catch (error) {
  console.error('Error checking image file:', error);
}

// Foydalanuvchilar balansi (aslida bu ma'lumotlar bazasida saqlanishi kerak)
const userBalances = {};

// Buyurtma yaratish uchun handler
bot.action(/buy:(premium|stars):(\d+):(\d+)/, async (ctx) => {
  console.log('Purchase action triggered:', ctx.match[0]);
  const type = ctx.match[1]; // 'premium' yoki 'stars'
  const amount = parseInt(ctx.match[2]); // oylik miqdor yoki stars miqdori
  const price = parseInt(ctx.match[3]); // narx
  const userId = ctx.from.id;
  
  // Initialize session if it doesn't exist
  if (!ctx.session) {
    ctx.session = {};
    console.log('Initialized new session in purchase action');
  }
  
  // Foydalanuvchi balansini tekshirish
  const userBalance = await getUserBalance(userId);
  console.log(`User balance: ${userBalance}, Purchase price: ${price}`);
  
  // Agar balans yetarli bo'lsa
  if (userBalance >= price) {
    // Sessiyada saqlaymiz
    ctx.session.purchase = { 
      type, 
      amount, 
      price,
      step: 'username' // Add step to track the purchase flow
    };
    console.log('Updated session with purchase data:', JSON.stringify(ctx.session, null, 2));
    
    // Foydalanuvchidan username so'raymiz
    await sendOrUpdateMenu(
      ctx,
      `✅ Sotib olish uchun Telegram usernamingizni kiriting:\n` +
      `📦 Mahsulot: ${type === 'premium' ? 'Telegram Premium' : 'Telegram Stars'}\n` +
      `🔢 Miqdor: ${amount} ${type === 'premium' ? 'oy' : 'stars'}\n` +
      `💰 Narxi: ${price.toLocaleString()} so'm\n\n` +
      `Iltimos, shu formatda yuboring: @username`,
      [[Markup.button.callback('❌ Bekor qilish', 'back:main')]]
    );
  } else {
    // Balans yetarli emas
    const needed = price - userBalance;
    await sendOrUpdateMenu(
      ctx,
      `❌ *Balansingizda yetarli mablag' yo'q!*\n\n` +
      `💳 Joriy balans: ${userBalance.toLocaleString()} so'm\n` +
      `💰 Kerak bo'lgan summa: ${price.toLocaleString()} so'm\n` +
      `📉 Yetishmayapti: ${needed.toLocaleString()} so'm\n\n` +
      `Iltimos, balansingizni to'ldiring va qayta urinib ko'ring.`,
      [
        [Markup.button.callback('💳 Balansni to\'ldirish', 'topup:amount')],
        [Markup.button.callback('🔄 Qayta urinish', `back:${type === 'premium' ? 'premium' : 'stars'}`)]
      ],
      { parse_mode: 'Markdown' }
    );
  }
});

// Tasdiqlash uchun buyurtmalar
const pendingOrders = {}; // { orderId: { userId, type, amount, username, price } }

// Tasodifiy buyurtma ID generatsiya qilish
function generateOrderId() {
  return Math.random().toString(36).substr(2, 9);
}


// Admin order confirmation handler
bot.action(/admin_(confirm|cancel):(.+)/, async (ctx) => {
  try {
    const action = ctx.match[1]; // 'confirm' or 'cancel'
    const orderId = ctx.match[2];
    
    // Check if admin
    if (!isAdmin(ctx)) {
      await ctx.answerCbQuery('Ruxsat yo\'q!');
      return;
    }
    
    // Get the order
    if (!global.pendingOrders || !global.pendingOrders[orderId]) {
      await ctx.answerCbQuery('Buyurtma topilmadi!');
      return;
    }
    
    const order = global.pendingOrders[orderId];
    
    if (action === 'confirm') {
      // Mark order as completed
      order.status = 'completed';
      order.completedAt = new Date().toISOString();
      order.handledBy = ctx.from.id;
      
      // Notify user
      try {
        await ctx.telegram.sendMessage(
          order.userId,
          `✅ Sizning buyurtmangiz tasdiqlandi!\n\n` +
          `🆔 Buyurtma ID: ${order.id}\n` +
          `📦 Mahsulot: ${order.type === 'premium' ? `Telegram Premium ${order.amount} oy` : `${order.amount} Stars`}\n` +
          `💰 Narxi: ${order.price.toLocaleString()} so'm\n\n` +
          `📞 Aloqa: @d1yor_salee`
        );
      } catch (error) {
        console.error('Error notifying user:', error);
      }
      
      // Update the admin message
      await ctx.editMessageText(
        `✅ *Buyurtma tasdiqlandi*\n` +
        `👤 Admin: @${ctx.from.username || 'Noma\'lum'}\n` +
        `⏰ Vaqt: ${new Date().toLocaleString()}\n\n` +
        `ℹ Buyurtma ma\'lumotlari:\n` +
        `🆔 ID: ${order.id}\n` +
        `👤 Foydalanuvchi: [${order.username}](tg://user?id=${order.userId})\n` +
        `📦 Mahsulot: ${order.type === 'premium' ? `Telegram Premium ${order.amount} oy` : `${order.amount} Stars`}\n` +
        `👥 Foydalanuvchi: ${order.targetUsername}\n` +
        `💰 Narxi: ${order.price.toLocaleString()} so'm`,
        { 
          parse_mode: 'MarkdownV2',
          reply_markup: { inline_keyboard: [] } // Remove buttons
        }
      );
      
      await ctx.answerCbQuery('✅ Buyurtma tasdiqlandi!');
      
    } else if (action === 'cancel') {
      // Mark order as cancelled
      order.status = 'cancelled';
      order.cancelledAt = new Date().toISOString();
      order.handledBy = ctx.from.id;
      
      // Refund the user
      const newBalance = await updateUserBalance(order.userId, order.price);
      
      // Notify user
      try {
        await ctx.telegram.sendMessage(
          order.userId,
          `❌ Sizning buyurtmangiz bekor qilindi.\n\n` +
          `🆔 Buyurtma ID: ${order.id}\n` +
          `💰 ${order.price.toLocaleString()} so'm hisobingizga qaytarildi.\n\n` +
          `❓ Sabab: Admin tomonidan bekor qilindi\n` +
          `📞 Aloqa: @d1yor_salee`
        );
        console.log(`Notification sent to user ${order.userId}`);
      } catch (error) {
        console.error(`Failed to send notification to user ${order.userId}:`, error);
      }
      
      // Update the admin message
      await ctx.editMessageText(
        `❌ *Buyurtma bekor qilindi*\n` +
        `👤 Admin: @${ctx.from.username || 'Noma\'lum'}\n` +
        `⏰ Vaqt: ${new Date().toLocaleString()}\n\n` +
        `ℹ Buyurtma ma\'lumotlari:\n` +
        `🆔 ID: ${order.id}\n` +
        `👤 Foydalanuvchi: [${order.username}](tg://user?id=${order.userId})\n` +
        `📦 Mahsulot: ${order.type === 'premium' ? `Telegram Premium ${order.amount} oy` : `${order.amount} Stars`}\n` +
        `👥 Foydalanuvchi: ${order.targetUsername}\n` +
        `💰 Narxi: ${order.price.toLocaleString()} so'm`,
        { 
          parse_mode: 'MarkdownV2',
          reply_markup: { inline_keyboard: [] } // Remove buttons
        }
      );
      
      await ctx.answerCbQuery('❌ Buyurtma bekor qilindi!');
    }
    
  } catch (error) {
    console.error('Error in admin action handler:', error);
    try {
      await ctx.answerCbQuery('Xatolik yuz berdi!');
    } catch (e) {
      console.error('Error sending error message:', e);
    }
  }
});

// ---------- Pul ishlash (Earn Money) ----------
async function sendEarnMoneyMenu(ctx) {
  try {
    const userId = ctx.from.id;
    const username = ctx.from.username || ctx.from.first_name || 'foydalanuvchi';
    
    // Hardcode bot username for short referral link
    const referralLink = `https://t.me/Tekin_akkaunt_ol_bot?start=ref${userId}`;
    
    // Get referral stats
    const referralCount = referrals[userId] ? referrals[userId].length : 0;
    const totalEarned = referralCount * REFERRAL_BONUS;
    
    const message = `💰 *Pul ishlash* 💰\n\n` +
      `🔗 Sizning referal havolangiz:\n\`${referralLink}\`\n\n` +
      `👥 Sizning takliflaringiz: *${referralCount} ta*\n` +
      `💵 Jami ishlagan pulingiz: *${totalEarned} so'm*\n\n` +
      `📢 Do'stlaringizni taklif qiling va har bir taklif uchun *${REFERRAL_BONUS} so'm* oling!\n` +
      `Ular ham siz kabi pul ishlashni boshlaydilar!`;
    
    const keyboard = [
      [Markup.button.switchToChat('📤 Do\'stlarni taklif qilish', '')],
      [Markup.button.callback('🔄 Referal havolani yangilash', 'refresh_referral')],
      [Markup.button.callback('⬅️ Orqaga', 'back:main')]
    ];
    
    // Try to edit the message, if that fails, send a new one
    try {
      if (ctx.callbackQuery) {
        await ctx.editMessageText(message, {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard(keyboard)
        });
      } else {
        await ctx.reply(message, {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard(keyboard)
        });
      }
    } catch (error) {
      console.error('Error editing/sending message:', error);
      await ctx.reply(message, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(keyboard)
      });
    }
  } catch (error) {
    console.error('Error in sendEarnMoneyMenu:', error);
    await ctx.reply('Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.', {
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🔙 Orqaga', 'back:main')]
      ])
    });
  }
}

// Handle start with referral
const handleReferral = async (ctx) => {
  try {
    console.log('Referral link detected, checking...');
    const startPayload = ctx.message?.text?.split(' ')[1];
    if (!startPayload || !startPayload.startsWith('ref')) {
      console.log('No valid referral payload found');
      return;
    }
    
    const referrerId = parseInt(startPayload.replace('ref', ''));
    const userId = ctx.from.id;
    
    console.log(`Referral check - Referrer: ${referrerId}, New User: ${userId}`);
    
    // Don't count if user is referring themselves
    if (referrerId === userId) {
      console.log(`User ${userId} tried to refer themselves`);
      return;
    }
    
    } catch (error) {
      console.error('Error in referral handling:', error);
      // Don't notify the user, just log the error
    }
  }

  // Matnli xabarlarni qayta ishlash
bot.on('text', async (ctx, next) => {
  // Check for subscription first
  if (!(await isSubscribed(ctx))) {
    return; // Stop processing if not subscribed
  }

  // Save user info on every message
  await saveUserInfo(ctx.from);

  // --- Purchase Flow ---
  if (ctx.session?.purchase?.step === 'username') {
    const username = ctx.message.text.trim();
    if (!username.startsWith('@') || username.length < 3) {
      await ctx.reply('❌ Iltimos, to\'g\'ri formatda kiriting: @username');
      return;
    }

    try {
      const { type, amount, price } = ctx.session.purchase;
      const userId = ctx.from.id;
      const user = ctx.from.username || ctx.from.first_name;

      // Check balance again before finalizing
      const currentBalance = await getUserBalance(userId);
      if (currentBalance < price) {
        const needed = price - currentBalance;
        await ctx.reply(`❌ Balansingizda yetarli mablag' qolmabdi. Sizga yana ${needed.toLocaleString()} so'm kerak.`);
        delete ctx.session.purchase;
        return await sendMainMenu(ctx);
      }

      // Deduct balance
      await updateUserBalance(userId, -price);

      // Create order
      const orderId = 'ORD-' + Date.now();
      const order = {
        id: orderId, userId, username: user, type, amount, price,
        targetUsername: username, timestamp: new Date().toISOString(), status: 'pending'
      };

      if (!global.pendingOrders) global.pendingOrders = {};
      global.pendingOrders[orderId] = order;

      // Notify user
      await ctx.reply(`✅ Buyurtmangiz qabul qilindi! Tez orada adminlar siz bilan bog'lanadi.\n\n` +
        `🆔 Buyurtma ID: ${orderId}\n` +
        `💰 Narxi: ${price.toLocaleString()} so'm\n` +
        `📞 Aloqa: @d1yor_salee`);

      // Notify admins
      const adminMessage = `🛒 *Yangi buyurtma*\n` +
        `🆔 ID: \`${orderId}\`\n` +
        `👤 Kimdan: [${escapeMarkdown(user)}](tg://user?id=${userId})\n` +
        `📦 Mahsulot: ${type === 'premium' ? `${amount} oy Premium` : `${amount} Stars`}\n` +
        `🎯 Kimga: ${escapeMarkdown(username)}\n` +
        `💰 Narxi: ${price.toLocaleString()} so'm`;

      const adminKeyboard = Markup.inlineKeyboard([
        Markup.button.callback('✅ Tasdiqlash', `admin_confirm:${orderId}`),
        Markup.button.callback('❌ Bekor qilish', `admin_cancel:${orderId}`)
      ]);

      for (const adminId of ADMIN_IDS) {
        try {
          await ctx.telegram.sendMessage(adminId, adminMessage, { parse_mode: 'MarkdownV2', ...adminKeyboard });
        } catch (e) {
          console.error(`Admin ${adminId} ga xabar yuborishda xatolik:`, e);
        }
      }

      delete ctx.session.purchase;
      await sendMainMenu(ctx);

    } catch (error) {
      console.error('Purchase processing error:', error);
      await ctx.reply('Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
      delete ctx.session.purchase;
      await sendMainMenu(ctx);
    }
    return; // Stop further processing
  }
  
  // --- Promo Code Flow ---
  if (ctx.session?.awaitingPromoCode) {
    const promoCode = ctx.message.text.trim();
    try {
      const result = await handlePromoCode(ctx, promoCode);
      if (result.valid) {
        await updateUserBalance(ctx.from.id, result.amount);
        await ctx.reply(`✅ Promokod muvaffaqiyatli faollashtirildi! Hisobingizga ${result.amount.toLocaleString()} so'm qo'shildi.`);
      } else {
        await ctx.reply(result.message);
      }
    } catch (error) {
      console.error('Error handling promo code:', error);
      await ctx.reply('Promokodni tekshirishda xatolik yuz berdi.');
    }
    delete ctx.session.awaitingPromoCode;
    return; // Stop further processing
  }

  // --- Admin Price Editing Flow ---
  if (ctx.session?.editingPrice) {
    const { type, key } = ctx.session.editingPrice;
    const priceText = ctx.message.text.trim();
    const price = parseInt(priceText.replace(/\D/g, ''));

    if (isNaN(price) || price <= 0) {
      await ctx.reply('❌ Iltimos, to\'g\'ri narx kiriting.');
      return;
    }

    try {
      await updatePrice(type, key, price);
      await ctx.reply(`✅ Narx muvaffaqiyatli ${price.toLocaleString()} so'mga yangilandi!`);
      delete ctx.session.editingPrice;
      // Show the relevant admin price menu again
      if (type === 'stars' || type === 'premium') await showPremiumStarsPrices(ctx, true);
      else await showGamePrices(ctx, true);
    } catch (error) {
      console.error('Error updating price:', error);
      await ctx.reply('❌ Narxni yangilashda xatolik yuz berdi.');
    }
    return; // Stop further processing
  }

  // --- Admin Card Editing Flow ---
  if (ctx.session?.editingCard) {
    const { field } = ctx.session.editingCard;
    const value = ctx.message.text.trim();

    if ((field === 'uzcard' || field === 'humo') && !/^\d{16}$/.test(value.replace(/\s/g, ''))) {
        await ctx.reply('❌ Karta raqami 16 ta raqamdan iborat bo\'lishi kerak!');
        return;
    }

    try {
        const envVar = field === 'uzcard' ? 'UZCARD_NUMBER' : (field === 'humo' ? 'HUMO_NUMBER' : 'CARD_OWNER');
        await updateEnvFile({ [envVar]: value });
        await ctx.reply(`✅ ${field} ma'lumoti muvaffaqiyatli yangilandi!`);
        delete ctx.session.editingCard;
        await showCardMenu(ctx);
    } catch (error) {
        console.error('Error updating card info:', error);
        await ctx.reply('❌ Ma\'lumotni yangilashda xatolik yuz berdi.');
    }
    return; // Stop further processing
  }

  // If no specific flow is active, pass to the next middleware
  if (typeof next === 'function') {
    return next();
  }
});

// O'yin narxlari menyusi va handlerlari o'chirildi

// Webhook configuration for Render deployment
const express = require('express');
const app = express();
const path = require('path');
const url = require('url');

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/status', (req, res) => {
  res.json({ status: 'Bot ishlayapti 🚀', timestamp: new Date() });
});

// Error handling
app.use((req, res) => {
  res.status(404).json({ error: 'Sahifa topilmadi' });
});

// Start the HTTP server
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`HTTP Server ${PORT} portida ishlayapti`);
  
  // Set webhook if in production
  if (process.env.RENDER) {
    const webhookUrl = process.env.RENDER_EXTERNAL_URL || `https://${process.env.RENDER_SERVICE_NAME}.onrender.com`;
    bot.telegram.setWebhook(`${webhookUrl}/bot${process.env.BOT_TOKEN}`)
      .then(() => console.log('Webhook muvaffaqiyatli o\'rnatildi'))
      .catch(err => console.error('Webhook o\'rnatishda xatolik:', err));
  }
});

// Webhook endpoint
app.post(`/bot${process.env.BOT_TOKEN}`, (req, res) => {
  bot.handleUpdate(req.body, res);
});

// Start the bot in webhook mode if in production, otherwise use polling for development
if (process.env.RENDER) {
  // Webhook mode for production
  console.log('Webhook rejimida ishga tushirilmoqda...');
  // Remove webhook when shutting down
  const shutdown = async () => {
    console.log('Server yopilmoqda...');
    try {
      await bot.telegram.deleteWebhook();
      console.log('Webhook muvaffaqiyatli o\'chirildi');
    } catch (err) {
      console.error('Webhook o\'chirishda xatolik:', err);
    }
    server.close(() => {
      console.log('Server yopildi');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
} else {
  // Polling mode for development
  console.log('Polling rejimida ishga tushirilmoqda...');
  bot.launch();
  
  const shutdown = () => {
    console.log('Server yopilmoqda...');
    server.close(() => {
      console.log('Server yopildi');
      process.exit(0);
    });
  };

  process.on('SIGINT', () => {
    bot.stop('SIGINT');
    shutdown();
  });

  process.on('SIGTERM', () => {
    bot.stop('SIGTERM');
    shutdown();
  });
}
