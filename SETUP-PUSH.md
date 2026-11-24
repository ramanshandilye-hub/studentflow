# 🔔 StudentFlow — Real Background Push Reminders Setup Guide

Yeh guide aapko step-by-step sikhata hai ki **OneSignal Web Push** aur **Cloudflare Worker** configure karke real background push reminders kaise activate karein — jo app close hone ke baad bhi time par phone ya desktop par deliver hote hain.

---

## 🏗️ Architecture Overview (Kyun aur Kaise?)

1. **OneSignal (Free Tier):**
   - Push subscriptions manage karta hai aur scheduled notifications queue karta hai (`send_after`).
2. **Cloudflare Worker (`push-worker/`):**
   - Yeh ek chhota, secure serverless proxy hai.
   - **OneSignal REST API Key** is worker ke andar securely encrypt rehti hai (`wrangler secret put`).
   - Browser client kabhi bhi aapki secret key nahi dekhta — repository public hone par bhi 100% safe hai!
3. **StudentFlow PWA Client:**
   - Single unified Service Worker (`sw.js`) ke through cache-first offline capability aur push reception dono handle karta hai.

---

## 📋 Pre-requisites (Aapko kya chahiye)

1. Ek free **OneSignal** account: [https://onesignal.com](https://onesignal.com)
2. Ek free **Cloudflare** account: [https://dash.cloudflare.com](https://dash.cloudflare.com)
3. Node.js (v18 ya latest) aapke system par installed ho (`node -v`).

---

## 🚀 Step 1: OneSignal App Banayein

1. [onesignal.com](https://onesignal.com) par login karein aur dashboard par jayein.
2. Click karein **New App/Website**.
3. App Name enter karein: `StudentFlow`.
4. Platform select karein: **Web**. Click **Next: Configure Platform**.
5. Choose Integration: **Custom Code**.
6. Site Setup:
   - **Site Name:** `StudentFlow`
   - **Site URL:** `https://ramanshandilye-hub.github.io/studentflow/` *(Dhyan dein: aakhri mein slash `/` zaroor ho!)*
   - **Auto Resubscribe (HTTPS only):** Toggle **ON**.
   - **Default Icon URL:** Aap repo se `icon-192.png` ya `icon-512.png` ka direct URL de sakte hain ya image upload kar sakte hain.
7. Click **Save**.

### OneSignal Keys Kahan Milengi?
- OneSignal dashboard mein upar ya left menu mein jayein: **Settings** → **Keys & IDs**.
- Aapko do cheezein milengi:
  1. **OneSignal App ID** (yeh public UUID hoti hai, jaise `a1b2c3d4-e5f6-...`) — isko copy karein.
  2. **REST API Key** (yeh SECRET key hoti hai, jaise `os_v2_app_...`) — **Isko kisi ke sath share mat karein aur GitHub par commit mat karein!**

---

## ⚡ Step 2: Cloudflare Worker Setup aur Deploy Karein

Aapke repository folder mein already `push-worker/` folder tayyar hai jismein `src/index.js` aur `wrangler.toml` bane hue hain.

1. Terminal ya Command Prompt kholein aur `push-worker` directory mein jayein:
   ```bash
   cd push-worker
   ```

2. Agar Wrangler pehle se installed nahi hai, toh install karein:
   ```bash
   npm install -g wrangler
   ```

3. Cloudflare account login karein:
   ```bash
   npx wrangler login
   ```
   *(Browser khulega, "Allow" par click karke login complete karein).*

4. Secret REST API Key set karein (Yeh key Cloudflare ke secure vault mein save hoti hai):
   ```bash
   npx wrangler secret put ONESIGNAL_REST_API_KEY
   ```
   Jab prompt aaye: `Enter a secret value:`, apni OneSignal **REST API Key** paste karein aur Enter dabayein.

5. `push-worker/wrangler.toml` file kholein aur `YOUR_ONESIGNAL_APP_ID` ki jagah apna actual OneSignal App ID likhein:
   ```toml
   [vars]
   ONESIGNAL_APP_ID = "apna-onesignal-app-id-yahan-paste-karein"
   ```

6. Worker ko deploy karein:
   ```bash
   npx wrangler deploy
   ```
   Deploy hone ke baad terminal mein aapko aapka Worker URL dikhega, jaise:
   `https://studentflow-push.<your-subdomain>.workers.dev`

---

## 🔗 Step 3: Client (`script.js`) mein Details Daalein

1. Project root folder mein `script.js` file kholein.
2. Sabse upar (lines ~24-25) aapko do constants dikhenge:
   ```javascript
   const ONESIGNAL_APP_ID = 'apna-onesignal-app-id-yahan-dalein'; // e.g. "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
   const PUSH_API_URL = 'https://studentflow-push.<your-subdomain>.workers.dev'; // Worker URL
   ```
3. File save karein!

> 💡 **Note:** Jab tak yeh dono variables empty ya placeholder rahenge, StudentFlow automatically local in-app deadline reminders use karega aur push feature UI hide rahega. Jaise hi aap details bharte hain, real background push activate ho jayega.

---

## 📤 Step 4: GitHub Par Changes Push Karein

1. Root repository mein terminal kholein:
   ```bash
   git add .
   git commit -m "feat: setup real background push reminders via OneSignal and Cloudflare Worker"
   git push origin main
   ```
2. GitHub Pages automatically aapka update 1-2 minutes mein live kar dega:
   👉 **`https://ramanshandilye-hub.github.io/studentflow/`**

---

## 📱 Step 5: Test Kaise Karein? (Testing Checklist)

### 1. Desktop (Chrome / Brave / Firefox / Edge):
- Live site kholein: `https://ramanshandilye-hub.github.io/studentflow/`
- Header mein **"Notify me"** bell button par click karein.
- **Enable Background Reminders** switch ko ON karein.
- Browser notification permission pop-up aayega -> **"Allow"** karein.
- Modal ke andar **"Send test push"** button par click karein.
- 10 seconds wait karein (ya dusra tab open kar lijiye) -> `🔔 StudentFlow Test Alert` notification screen par aayegi!
- Naya assignment add karein with Due Date aur Time. StudentFlow ko close kar dein. Set time par background push aapke system par deliver hoga!

### 2. Android Phone (Chrome):
- Chrome mein `https://ramanshandilye-hub.github.io/studentflow/` kholein.
- "Notify me" tap karein aur background reminders enable karein.
- "Send test push" tap karein aur phone screen lock kar dein. 10 second baad lock screen par notification show hoga!

### 3. iPhone / iPad (iOS 16.4+):
- Safari browser mein `https://ramanshandilye-hub.github.io/studentflow/` kholein.
- Niche **Share** button (box with up arrow ⎋) par tap karein.
- Scroll down karke **"Add to Home Screen"** select karein.
- Ab Home Screen se StudentFlow open karein (PWA mode).
- "Notify me" tap karke reminders ON karein.

---

## 🛠️ Verification & Edge-Case Testing

- [x] **Task Complete hone par:** Kisi task ka checkbox tick karein -> uske future scheduled pushes cancel ho jayenge (koi bewajah alert nahi aayega).
- [x] **Task Edit hone par:** Task ki due date ya time change karein -> pura schedule automatically recalculate aur reschedule ho jayega.
- [x] **Task Delete hone par:** Task delete karein -> uske saare scheduled pushes turant cancel ho jayenge.
- [x] **Offline Support:** Agar internet disconnected hai aur aap task add/edit karte hain, schedule offline queue mein save hota hai aur internet aate hi automatically sync ho jata hai.
- [x] **Quiet Hours:** Raat ke waqt quiet hours set karein taaki study ya sleep ke time notification mute rahe.

---

## ❓ Troubleshooting (Aam Samasyaein)

### 1. "403 Forbidden Origin" error:
- Worker security ke liye restricted hai sirf `https://ramanshandilye-hub.github.io` ke liye.
- Agar aap localhost (`127.0.0.1`) par test kar rahe hain, toh live URL par test karein ya temporary testing ke liye worker ke `ALLOWED_ORIGIN` mein localhost origin add karke `npx wrangler deploy` karein.

### 2. Notification Permission block ho gayi:
- Browser URL bar mein lock 🔒 ya site settings icon par click karein.
- Notifications ko **"Allow"** karein aur page reload karein.

### 3. Brave Browser / Adblocker users:
- Brave shields ya uBlock Origin kabhi kabhi OneSignal SDK script (`cdn.onesignal.com`) ko block kar dete hain.
- StudentFlow ke liye shield ko pause karein taaki push script load ho sake.

### 4. Purana Service Worker cache:
- Agar purana version dikh raha ho, toh browser mein **Ctrl + Shift + R** (Mac par **Cmd + Shift + R**) daba kar hard refresh karein. Service worker automatically cache `studentflow-v5` par update ho jayega.
