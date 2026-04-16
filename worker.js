/**
 * CreatorClaw — Cloudflare Worker
 * - Regular mode: Chat Completions API with gpt-4o-mini
 * - Web search mode: Responses API with gpt-4o + web_search_preview
 * - IG scrape mode: Apify Instagram Profile Scraper → OpenAI interpretation
 */

const CHAT_URL = 'https://api.openai.com/v1/chat/completions';
const RESPONSES_URL = 'https://api.openai.com/v1/responses';
const APIFY_IG_URL = 'https://api.apify.com/v2/acts/apify~instagram-profile-scraper/run-sync-get-dataset-items';
const MODEL = 'gpt-4o-mini';
const MODEL_SEARCH = 'gpt-4o';

const ALLOWED_ORIGINS = [
  'https://creatorclaw.co',
  'http://creatorclaw.co',
  'https://www.creatorclaw.co',
  'http://www.creatorclaw.co',
  'https://thetzn.github.io',
  'http://localhost',
  'http://127.0.0.1',
];


// ── Static page routing ───────────────────────────────────────────────────────
const PRIVACY_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Privacy Policy — CreatorClaw</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<style>
:root{
  --bg:#0A0A0A;--card:#111111;--card2:#161616;--border:#1E1E1E;--border2:#2A2A2A;
  --text:#F0EDE8;--muted:#6B6560;--muted2:#4A4641;
  --gold:#C9A96E;--gold2:#E8D5A3;--gold3:#B8965A;--gold-dim:rgba(201,169,110,0.12);--gold-border:rgba(201,169,110,0.2);
  --scheme:dark;
}
:root[data-theme="light"]{
  --bg:#F5F1E8;--card:#FFFEF9;--card2:#F0EAD8;--border:#E5DDC9;--border2:#D4CAB0;
  --text:#2A251D;--muted:#7A6F5F;--muted2:#A09484;
  --gold:#A67B3D;--gold2:#C99B5A;--gold3:#8A6431;
  --gold-dim:rgba(166,123,61,0.10);--gold-border:rgba(166,123,61,0.25);
}
:root[data-theme="light"] .header{background:rgba(245,241,232,0.9)}
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--bg);color:var(--text);font-family:'Inter',sans-serif;min-height:100vh;-webkit-font-smoothing:antialiased;overflow-x:hidden}
button{font-family:'Inter',sans-serif;cursor:pointer;border:none;transition:all 0.3s ease}
.gold-text{background:linear-gradient(135deg,var(--gold3),var(--gold),var(--gold2));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.header{background:rgba(10,10,10,0.9);border-bottom:1px solid var(--border);padding:0 32px;position:sticky;top:0;z-index:50;backdrop-filter:blur(20px)}
.header-inner{max-width:1100px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;height:64px}
.logo{display:flex;align-items:center;gap:10px;text-decoration:none}
.logo-mark{width:26px;height:16px;flex-shrink:0}
.logo-text{font-size:18px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase}
.theme-toggle{background:transparent;border:1px solid var(--border);border-radius:6px;padding:7px 9px;color:var(--muted);cursor:pointer;display:flex;align-items:center;transition:all 0.3s}
.theme-toggle:hover{color:var(--gold);border-color:var(--gold-border)}
.theme-toggle svg{width:14px;height:14px;display:block}
.main{max-width:760px;margin:0 auto;padding:60px 32px 100px}
.doc-eyebrow{font-size:10px;font-weight:600;color:var(--muted);letter-spacing:0.25em;text-transform:uppercase;margin-bottom:16px}
.doc-title{font-size:36px;font-weight:300;letter-spacing:-0.01em;margin-bottom:12px}
.doc-meta{font-size:12px;color:var(--muted);margin-bottom:48px}
.doc-section{margin-bottom:40px}
.doc-section h2{font-size:14px;font-weight:600;letter-spacing:0.15em;text-transform:uppercase;color:var(--gold);margin-bottom:16px;padding-bottom:10px;border-bottom:1px solid var(--border)}
.doc-section p{font-size:14px;line-height:1.8;color:var(--text);margin-bottom:14px}
.doc-section ul{padding-left:20px;margin-bottom:14px}
.doc-section ul li{font-size:14px;line-height:1.8;color:var(--text);margin-bottom:6px}
.doc-section ul li::marker{color:var(--gold)}
.doc-section a{color:var(--gold);text-decoration:none}
.doc-section a:hover{text-decoration:underline}
.back-link{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:600;color:var(--muted);letter-spacing:0.1em;text-transform:uppercase;text-decoration:none;margin-bottom:40px;transition:color 0.2s}
.back-link:hover{color:var(--gold)}
.footer-links{display:flex;gap:24px;margin-top:60px;padding-top:32px;border-top:1px solid var(--border)}
.footer-links a{font-size:11px;color:var(--muted);text-decoration:none;letter-spacing:0.05em;transition:color 0.2s}
.footer-links a:hover{color:var(--gold)}
@media(max-width:768px){
  .header{padding:0 16px}
  .header-inner{height:52px}
  .logo-text{font-size:14px}
  .main{padding:24px 16px 60px}
  .doc-title{font-size:26px}
}
</style>
</head>
<body>

<div class="header">
  <div class="header-inner">
    <a href="/" class="logo">
      <svg class="logo-mark" viewBox="0 0 130 80" shape-rendering="crispEdges" aria-hidden="true">
        <defs>
          <linearGradient id="cc-rainbow" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#A855F7"/><stop offset="18%" stop-color="#6366F1"/>
            <stop offset="35%" stop-color="#3B82F6"/><stop offset="50%" stop-color="#10B981"/>
            <stop offset="65%" stop-color="#EAB308"/><stop offset="82%" stop-color="#F97316"/>
            <stop offset="100%" stop-color="#EC4899"/>
          </linearGradient>
        </defs>
        <g fill="url(#cc-rainbow)">
          <rect x="40" y="0" width="10" height="10"/><rect x="80" y="0" width="10" height="10"/>
          <rect x="40" y="10" width="50" height="10"/><rect x="10" y="20" width="10" height="10"/>
          <rect x="30" y="20" width="70" height="10"/><rect x="110" y="20" width="10" height="10"/>
          <rect x="0" y="30" width="30" height="10"/><rect x="40" y="30" width="10" height="10"/>
          <rect x="60" y="30" width="10" height="10"/><rect x="80" y="30" width="10" height="10"/>
          <rect x="100" y="30" width="30" height="10"/><rect x="0" y="40" width="130" height="10"/>
          <rect x="10" y="50" width="110" height="10"/><rect x="0" y="60" width="10" height="10"/>
          <rect x="20" y="60" width="10" height="10"/><rect x="40" y="60" width="10" height="10"/>
          <rect x="60" y="60" width="10" height="10"/><rect x="80" y="60" width="10" height="10"/>
          <rect x="100" y="60" width="10" height="10"/><rect x="120" y="60" width="10" height="10"/>
          <rect x="10" y="70" width="10" height="10"/><rect x="30" y="70" width="10" height="10"/>
          <rect x="70" y="70" width="10" height="10"/><rect x="90" y="70" width="10" height="10"/>
        </g>
      </svg>
      <span class="logo-text gold-text">CreatorClaw</span>
    </a>
    <button class="theme-toggle" onclick="toggleTheme()" aria-label="Toggle theme">
      <svg id="theme-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></svg>
    </button>
  </div>
</div>

<div class="main">
  <a href="/" class="back-link">← Back to CreatorClaw</a>

  <div class="doc-eyebrow">Legal</div>
  <h1 class="doc-title">Privacy <span class="gold-text">Policy</span></h1>
  <p class="doc-meta">Effective Date: April 16, 2025 &nbsp;·&nbsp; Last Updated: April 16, 2025</p>

  <div class="doc-section">
    <p>CreatorClaw ("we," "our," or "us") operates the website at <a href="https://creatorclaw.co">creatorclaw.co</a> (the "Service"). This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our Service. Please read this policy carefully. If you disagree with its terms, please discontinue use of the Service.</p>
  </div>

  <div class="doc-section">
    <h2>1. Information We Collect</h2>
    <p>We may collect information about you in a variety of ways, including:</p>
    <ul>
      <li><strong>Information You Provide:</strong> When you connect social accounts, enter a handle for analysis, or otherwise interact with the Service, you may provide us with personal information such as usernames, profile URLs, and email addresses.</li>
      <li><strong>Automatically Collected Data:</strong> When you visit the Service, we may automatically collect certain information about your device, including your IP address, browser type, operating system, referring URLs, and pages visited.</li>
      <li><strong>Third-Party Platform Data:</strong> When you authorize CreatorClaw to analyze your social media profiles (e.g., Instagram), we access publicly available profile data — such as follower counts, post counts, engagement metrics, and bio text — through those platforms' public APIs or permitted scraping methods.</li>
      <li><strong>Usage Data:</strong> We collect information about how you interact with the Service, including which features you use, content ideas you save, and brand matches you view.</li>
    </ul>
  </div>

  <div class="doc-section">
    <h2>2. How We Use Your Information</h2>
    <p>We use the information we collect to:</p>
    <ul>
      <li>Provide, operate, and improve the Service</li>
      <li>Generate AI-powered persona analyses, brand matches, and content ideas</li>
      <li>Personalize your experience on the Service</li>
      <li>Analyze usage trends and optimize Service performance</li>
      <li>Communicate with you about updates, features, or support</li>
      <li>Comply with legal obligations</li>
    </ul>
    <p>We do not sell your personal information to third parties.</p>
  </div>

  <div class="doc-section">
    <h2>3. AI Processing &amp; Third-Party APIs</h2>
    <p>CreatorClaw uses artificial intelligence models, including services provided by third-party API providers (such as Moonshot AI / Kimi), to analyze your social media data and generate persona reports, brand matches, and content ideas. By using the Service, you acknowledge that your data (including social profile information you provide) may be transmitted to these third-party AI services for processing.</p>
    <p>These third-party providers have their own privacy policies, and we encourage you to review them. We take reasonable steps to minimize what data is shared and to use providers that maintain appropriate security standards.</p>
  </div>

  <div class="doc-section">
    <h2>4. Cookies &amp; Local Storage</h2>
    <p>We use browser local storage to save your theme preference (light/dark mode) and session state within the application. We may also use cookies for analytics purposes. You can instruct your browser to refuse all cookies or to indicate when a cookie is being sent; however, some features of the Service may not function properly without cookies or local storage.</p>
  </div>

  <div class="doc-section">
    <h2>5. Data Sharing &amp; Disclosure</h2>
    <p>We do not sell, trade, or rent your personal information. We may share information in the following circumstances:</p>
    <ul>
      <li><strong>Service Providers:</strong> We may share data with trusted third-party vendors who assist us in operating the Service (e.g., hosting providers, AI API providers, analytics services).</li>
      <li><strong>Legal Requirements:</strong> We may disclose information if required to do so by law or in response to valid requests by public authorities.</li>
      <li><strong>Business Transfers:</strong> In the event of a merger, acquisition, or sale of all or a portion of our assets, your information may be transferred as part of that transaction.</li>
      <li><strong>Protection of Rights:</strong> We may disclose information where we believe it is necessary to investigate, prevent, or take action regarding potential violations of our policies, fraud, or other illegal activities.</li>
    </ul>
  </div>

  <div class="doc-section">
    <h2>6. Data Retention</h2>
    <p>We retain your information only for as long as necessary to fulfill the purposes outlined in this Privacy Policy, unless a longer retention period is required or permitted by law. Because CreatorClaw is primarily a client-side application, much of your session data is stored locally in your browser and is not retained on our servers beyond the processing needed to generate your results.</p>
  </div>

  <div class="doc-section">
    <h2>7. Security</h2>
    <p>We implement commercially reasonable technical and organizational measures to protect your information from unauthorized access, disclosure, alteration, or destruction. However, no method of transmission over the internet or electronic storage is 100% secure, and we cannot guarantee absolute security.</p>
  </div>

  <div class="doc-section">
    <h2>8. Children's Privacy</h2>
    <p>The Service is not directed to individuals under the age of 13. We do not knowingly collect personal information from children under 13. If we become aware that a child under 13 has provided us with personal information, we will take steps to delete such information promptly.</p>
  </div>

  <div class="doc-section">
    <h2>9. Your Rights</h2>
    <p>Depending on your location, you may have certain rights regarding your personal information, including the right to access, correct, or delete your data. To exercise any of these rights, please contact us at the email address below. We will respond to your request in accordance with applicable law.</p>
  </div>

  <div class="doc-section">
    <h2>10. Links to Other Sites</h2>
    <p>The Service may contain links to third-party websites. We are not responsible for the privacy practices of those websites and encourage you to review their privacy policies before providing any personal information.</p>
  </div>

  <div class="doc-section">
    <h2>11. Changes to This Policy</h2>
    <p>We reserve the right to update this Privacy Policy at any time. We will notify you of any changes by updating the "Last Updated" date at the top of this page. Your continued use of the Service after any changes constitutes your acceptance of the revised policy.</p>
  </div>

  <div class="doc-section">
    <h2>12. Contact Us</h2>
    <p>If you have questions or concerns about this Privacy Policy, please contact us at:</p>
    <p><strong>CreatorClaw</strong><br>
    Email: <a href="mailto:legal@creatorclaw.co">legal@creatorclaw.co</a><br>
    Website: <a href="https://creatorclaw.co">creatorclaw.co</a></p>
  </div>

  <div class="footer-links">
    <a href="/">Home</a>
    <a href="/tos.html">Terms of Service</a>
    <a href="mailto:legal@creatorclaw.co">Contact</a>
  </div>
</div>

<script>
const MOON_SVG='<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>';
const SUN_SVG='<circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="6.34" y2="6.34"/><line x1="17.66" y1="17.66" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="6.34" y2="17.66"/><line x1="17.66" y1="6.34" x2="19.07" y2="4.93"/>';
function applyTheme(t){
  document.documentElement.setAttribute('data-theme',t);
  const icon=document.getElementById('theme-icon');
  if(icon) icon.innerHTML=t==='light'?MOON_SVG:SUN_SVG;
}
function toggleTheme(){
  const cur=document.documentElement.getAttribute('data-theme')||'dark';
  const next=cur==='dark'?'light':'dark';
  applyTheme(next);
  try{localStorage.setItem('cc-theme',next)}catch(e){}
}
(function(){
  let saved='dark';
  try{saved=localStorage.getItem('cc-theme')||'dark'}catch(e){}
  applyTheme(saved);
})();
</script>
</body>
</html>
`;
const TOS_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Terms of Service — CreatorClaw</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<style>
:root{
  --bg:#0A0A0A;--card:#111111;--card2:#161616;--border:#1E1E1E;--border2:#2A2A2A;
  --text:#F0EDE8;--muted:#6B6560;--muted2:#4A4641;
  --gold:#C9A96E;--gold2:#E8D5A3;--gold3:#B8965A;--gold-dim:rgba(201,169,110,0.12);--gold-border:rgba(201,169,110,0.2);
  --scheme:dark;
}
:root[data-theme="light"]{
  --bg:#F5F1E8;--card:#FFFEF9;--card2:#F0EAD8;--border:#E5DDC9;--border2:#D4CAB0;
  --text:#2A251D;--muted:#7A6F5F;--muted2:#A09484;
  --gold:#A67B3D;--gold2:#C99B5A;--gold3:#8A6431;
  --gold-dim:rgba(166,123,61,0.10);--gold-border:rgba(166,123,61,0.25);
}
:root[data-theme="light"] .header{background:rgba(245,241,232,0.9)}
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--bg);color:var(--text);font-family:'Inter',sans-serif;min-height:100vh;-webkit-font-smoothing:antialiased;overflow-x:hidden}
button{font-family:'Inter',sans-serif;cursor:pointer;border:none;transition:all 0.3s ease}
.gold-text{background:linear-gradient(135deg,var(--gold3),var(--gold),var(--gold2));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.header{background:rgba(10,10,10,0.9);border-bottom:1px solid var(--border);padding:0 32px;position:sticky;top:0;z-index:50;backdrop-filter:blur(20px)}
.header-inner{max-width:1100px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;height:64px}
.logo{display:flex;align-items:center;gap:10px;text-decoration:none}
.logo-mark{width:26px;height:16px;flex-shrink:0}
.logo-text{font-size:18px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase}
.theme-toggle{background:transparent;border:1px solid var(--border);border-radius:6px;padding:7px 9px;color:var(--muted);cursor:pointer;display:flex;align-items:center;transition:all 0.3s}
.theme-toggle:hover{color:var(--gold);border-color:var(--gold-border)}
.theme-toggle svg{width:14px;height:14px;display:block}
.main{max-width:760px;margin:0 auto;padding:60px 32px 100px}
.doc-eyebrow{font-size:10px;font-weight:600;color:var(--muted);letter-spacing:0.25em;text-transform:uppercase;margin-bottom:16px}
.doc-title{font-size:36px;font-weight:300;letter-spacing:-0.01em;margin-bottom:12px}
.doc-meta{font-size:12px;color:var(--muted);margin-bottom:48px}
.doc-section{margin-bottom:40px}
.doc-section h2{font-size:14px;font-weight:600;letter-spacing:0.15em;text-transform:uppercase;color:var(--gold);margin-bottom:16px;padding-bottom:10px;border-bottom:1px solid var(--border)}
.doc-section p{font-size:14px;line-height:1.8;color:var(--text);margin-bottom:14px}
.doc-section ul{padding-left:20px;margin-bottom:14px}
.doc-section ul li{font-size:14px;line-height:1.8;color:var(--text);margin-bottom:6px}
.doc-section ul li::marker{color:var(--gold)}
.doc-section a{color:var(--gold);text-decoration:none}
.doc-section a:hover{text-decoration:underline}
.back-link{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:600;color:var(--muted);letter-spacing:0.1em;text-transform:uppercase;text-decoration:none;margin-bottom:40px;transition:color 0.2s}
.back-link:hover{color:var(--gold)}
.footer-links{display:flex;gap:24px;margin-top:60px;padding-top:32px;border-top:1px solid var(--border)}
.footer-links a{font-size:11px;color:var(--muted);text-decoration:none;letter-spacing:0.05em;transition:color 0.2s}
.footer-links a:hover{color:var(--gold)}
@media(max-width:768px){
  .header{padding:0 16px}
  .header-inner{height:52px}
  .logo-text{font-size:14px}
  .main{padding:24px 16px 60px}
  .doc-title{font-size:26px}
}
</style>
</head>
<body>

<div class="header">
  <div class="header-inner">
    <a href="/" class="logo">
      <svg class="logo-mark" viewBox="0 0 130 80" shape-rendering="crispEdges" aria-hidden="true">
        <defs>
          <linearGradient id="cc-rainbow" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#A855F7"/><stop offset="18%" stop-color="#6366F1"/>
            <stop offset="35%" stop-color="#3B82F6"/><stop offset="50%" stop-color="#10B981"/>
            <stop offset="65%" stop-color="#EAB308"/><stop offset="82%" stop-color="#F97316"/>
            <stop offset="100%" stop-color="#EC4899"/>
          </linearGradient>
        </defs>
        <g fill="url(#cc-rainbow)">
          <rect x="40" y="0" width="10" height="10"/><rect x="80" y="0" width="10" height="10"/>
          <rect x="40" y="10" width="50" height="10"/><rect x="10" y="20" width="10" height="10"/>
          <rect x="30" y="20" width="70" height="10"/><rect x="110" y="20" width="10" height="10"/>
          <rect x="0" y="30" width="30" height="10"/><rect x="40" y="30" width="10" height="10"/>
          <rect x="60" y="30" width="10" height="10"/><rect x="80" y="30" width="10" height="10"/>
          <rect x="100" y="30" width="30" height="10"/><rect x="0" y="40" width="130" height="10"/>
          <rect x="10" y="50" width="110" height="10"/><rect x="0" y="60" width="10" height="10"/>
          <rect x="20" y="60" width="10" height="10"/><rect x="40" y="60" width="10" height="10"/>
          <rect x="60" y="60" width="10" height="10"/><rect x="80" y="60" width="10" height="10"/>
          <rect x="100" y="60" width="10" height="10"/><rect x="120" y="60" width="10" height="10"/>
          <rect x="10" y="70" width="10" height="10"/><rect x="30" y="70" width="10" height="10"/>
          <rect x="70" y="70" width="10" height="10"/><rect x="90" y="70" width="10" height="10"/>
        </g>
      </svg>
      <span class="logo-text gold-text">CreatorClaw</span>
    </a>
    <button class="theme-toggle" onclick="toggleTheme()" aria-label="Toggle theme">
      <svg id="theme-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></svg>
    </button>
  </div>
</div>

<div class="main">
  <a href="/" class="back-link">← Back to CreatorClaw</a>

  <div class="doc-eyebrow">Legal</div>
  <h1 class="doc-title">Terms of <span class="gold-text">Service</span></h1>
  <p class="doc-meta">Effective Date: April 16, 2025 &nbsp;·&nbsp; Last Updated: April 16, 2025</p>

  <div class="doc-section">
    <p>Please read these Terms of Service ("Terms") carefully before using the CreatorClaw website at <a href="https://creatorclaw.co">creatorclaw.co</a> (the "Service") operated by CreatorClaw ("we," "our," or "us"). By accessing or using the Service, you agree to be bound by these Terms. If you do not agree, do not use the Service.</p>
  </div>

  <div class="doc-section">
    <h2>1. Eligibility</h2>
    <p>You must be at least 13 years of age to use the Service. By using the Service, you represent and warrant that you meet this age requirement. If you are under 18, you represent that you have your parent or guardian's permission to use the Service.</p>
  </div>

  <div class="doc-section">
    <h2>2. Description of Service</h2>
    <p>CreatorClaw is an AI-powered creator intelligence platform that analyzes publicly available social media data to generate persona reports, brand match recommendations, and content ideas. The Service is provided on an "as is" basis and is intended for informational and entertainment purposes. AI-generated outputs are not guaranteed to be accurate, complete, or suitable for any particular purpose.</p>
  </div>

  <div class="doc-section">
    <h2>3. Acceptable Use</h2>
    <p>By using the Service, you agree that you will not:</p>
    <ul>
      <li>Use the Service for any unlawful purpose or in violation of any applicable laws or regulations</li>
      <li>Attempt to scrape, crawl, or systematically extract data from the Service beyond normal use</li>
      <li>Interfere with or disrupt the integrity or performance of the Service or its underlying infrastructure</li>
      <li>Use the Service to harass, stalk, or harm any individual</li>
      <li>Misrepresent your identity or affiliation with any person or entity</li>
      <li>Attempt to gain unauthorized access to any portion of the Service or its related systems</li>
      <li>Use the Service to generate content that is defamatory, obscene, fraudulent, or otherwise objectionable</li>
      <li>Violate the terms of service of any third-party platform whose data you submit for analysis (e.g., Instagram)</li>
    </ul>
  </div>

  <div class="doc-section">
    <h2>4. Third-Party Platform Data</h2>
    <p>When you submit a social media handle or profile URL for analysis, you represent that you have the right to do so and that such submission does not violate the terms of service of the relevant third-party platform. CreatorClaw accesses only publicly available information. We are not responsible for the accuracy of data obtained from third-party platforms, nor for any changes those platforms make to their data availability or APIs.</p>
  </div>

  <div class="doc-section">
    <h2>5. AI-Generated Content</h2>
    <p>The persona analyses, brand recommendations, content ideas, pitch drafts, and scripts generated by the Service are produced by artificial intelligence and are provided for informational purposes only. They do not constitute professional business, legal, financial, or marketing advice. You should independently verify all AI-generated outputs before relying on them for any commercial or professional purpose.</p>
    <p>CreatorClaw makes no representation or warranty regarding the accuracy, reliability, or completeness of AI-generated content. Brand names, match scores, and deal estimates are illustrative and should not be interpreted as endorsements or guaranteed outcomes.</p>
  </div>

  <div class="doc-section">
    <h2>6. Intellectual Property</h2>
    <p>The Service and its original content (excluding user-submitted data and AI-generated outputs delivered to you), features, and functionality are and will remain the exclusive property of CreatorClaw and its licensors. Our trademarks and trade dress may not be used in connection with any product or service without our prior written consent.</p>
    <p>AI-generated outputs delivered to you through the Service (persona reports, scripts, pitch drafts, etc.) are provided for your personal, non-commercial use. You may use them for your own creator business purposes, but you may not resell or sublicense them as standalone products.</p>
  </div>

  <div class="doc-section">
    <h2>7. Privacy</h2>
    <p>Your use of the Service is also governed by our <a href="/privacy.html">Privacy Policy</a>, which is incorporated into these Terms by reference. Please review our Privacy Policy to understand our practices.</p>
  </div>

  <div class="doc-section">
    <h2>8. Disclaimer of Warranties</h2>
    <p>THE SERVICE IS PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS WITHOUT ANY WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR FREE OF VIRUSES OR OTHER HARMFUL COMPONENTS.</p>
  </div>

  <div class="doc-section">
    <h2>9. Limitation of Liability</h2>
    <p>TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL CREATORCLAW, ITS OFFICERS, DIRECTORS, EMPLOYEES, OR AGENTS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING WITHOUT LIMITATION LOSS OF PROFITS, DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES, RESULTING FROM YOUR ACCESS TO OR USE OF (OR INABILITY TO ACCESS OR USE) THE SERVICE.</p>
    <p>IN NO EVENT WILL OUR TOTAL LIABILITY TO YOU FOR ALL CLAIMS RELATING TO THE SERVICE EXCEED ONE HUNDRED DOLLARS ($100).</p>
  </div>

  <div class="doc-section">
    <h2>10. Indemnification</h2>
    <p>You agree to defend, indemnify, and hold harmless CreatorClaw and its officers, directors, employees, and agents from and against any claims, liabilities, damages, judgments, awards, losses, costs, expenses, or fees (including reasonable attorneys' fees) arising out of or relating to your violation of these Terms or your use of the Service.</p>
  </div>

  <div class="doc-section">
    <h2>11. Termination</h2>
    <p>We reserve the right to terminate or suspend your access to the Service immediately, without prior notice or liability, for any reason, including if you breach these Terms. Upon termination, your right to use the Service will immediately cease.</p>
  </div>

  <div class="doc-section">
    <h2>12. Governing Law</h2>
    <p>These Terms shall be governed by and construed in accordance with the laws of the United States and the state in which CreatorClaw operates, without regard to its conflict of law provisions. Any disputes arising under these Terms shall be resolved exclusively in the state or federal courts located in that jurisdiction.</p>
  </div>

  <div class="doc-section">
    <h2>13. Changes to Terms</h2>
    <p>We reserve the right to modify or replace these Terms at any time. If a revision is material, we will update the "Last Updated" date at the top of this page. Your continued use of the Service after any changes constitutes your acceptance of the new Terms.</p>
  </div>

  <div class="doc-section">
    <h2>14. Contact Us</h2>
    <p>If you have questions about these Terms, please contact us at:</p>
    <p><strong>CreatorClaw</strong><br>
    Email: <a href="mailto:legal@creatorclaw.co">legal@creatorclaw.co</a><br>
    Website: <a href="https://creatorclaw.co">creatorclaw.co</a></p>
  </div>

  <div class="footer-links">
    <a href="/">Home</a>
    <a href="/privacy.html">Privacy Policy</a>
    <a href="mailto:legal@creatorclaw.co">Contact</a>
  </div>
</div>

<script>
const MOON_SVG='<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>';
const SUN_SVG='<circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="6.34" y2="6.34"/><line x1="17.66" y1="17.66" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="6.34" y2="17.66"/><line x1="17.66" y1="6.34" x2="19.07" y2="4.93"/>';
function applyTheme(t){
  document.documentElement.setAttribute('data-theme',t);
  const icon=document.getElementById('theme-icon');
  if(icon) icon.innerHTML=t==='light'?MOON_SVG:SUN_SVG;
}
function toggleTheme(){
  const cur=document.documentElement.getAttribute('data-theme')||'dark';
  const next=cur==='dark'?'light':'dark';
  applyTheme(next);
  try{localStorage.setItem('cc-theme',next)}catch(e){}
}
(function(){
  let saved='dark';
  try{saved=localStorage.getItem('cc-theme')||'dark'}catch(e){}
  applyTheme(saved);
})();
</script>
</body>
</html>
`;

function serveHTML(html) {
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    // ── Static GET routes ────────────────────────────────────────────────
    if (request.method === 'GET') {
      if (path === '/privacy.html' || path === '/privacy') return serveHTML(PRIVACY_HTML);
      if (path === '/tos.html' || path === '/tos') return serveHTML(TOS_HTML);
    }

    const origin = request.headers.get('Origin') || '';
    const allowed = ALLOWED_ORIGINS.some(o => origin.startsWith(o));

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors(origin, allowed) });
    }
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
    if (!allowed) return new Response('Forbidden', { status: 403 });

    let body;
    try { body = await request.json(); }
    catch { return new Response('Invalid JSON', { status: 400 }); }

    // ── IG scrape via Apify ─────────────────────────────────────────────
    if (body.igScrape) {
      return runIGScrape(body.handle, env, origin, allowed);
    }

    const isWebSearch = body.webSearch;
    delete body.webSearch;

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + env.API_KEY,
    };

    let res;

    if (isWebSearch) {
      // Legacy path — kept as fallback
      const input = (body.messages || []).map(m => ({
        role: m.role === 'system' ? 'developer' : m.role,
        content: m.content,
      }));
      res = await fetch(RESPONSES_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model: MODEL_SEARCH, tools: [{ type: 'web_search_preview' }], input }),
      });
      const data = await res.json();
      if (!res.ok) {
        return new Response(JSON.stringify(data), { status: res.status, headers: { 'Content-Type': 'application/json', ...cors(origin, allowed) } });
      }
      const textOutput = (data.output || []).find(o => o.type === 'message');
      const text = textOutput?.content?.find(c => c.type === 'output_text')?.text || '';
      return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: text } }] }), {
        headers: { 'Content-Type': 'application/json', ...cors(origin, allowed) },
      });
    }

    // Regular Chat Completions
    res = await fetch(CHAT_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: MODEL,
        temperature: body.temperature || 0.7,
        messages: body.messages || [],
      }),
    });
    const data = await res.json();
    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { 'Content-Type': 'application/json', ...cors(origin, allowed) },
    });
  },
};

// ── IG scrape: Apify scrape + OpenAI interpretation ──────────────────────────
async function runIGScrape(rawHandle, env, origin, allowed) {
  const handle = String(rawHandle || '').replace(/^@/, '').replace(/^(https?:\/\/)?(www\.)?instagram\.com\//, '').replace(/\/$/, '').trim();
  if (!handle) {
    return json({ error: { message: 'No handle provided' } }, 400, origin, allowed);
  }

  // 1. Scrape profile + recent posts via Apify
  const apifyRes = await fetch(`${APIFY_IG_URL}?token=${env.APIFY_TOKEN}&timeout=90`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernames: [handle], resultsLimit: 25 }),
  });

  if (!apifyRes.ok) {
    const errText = await apifyRes.text();
    return json({ error: { message: 'Apify scrape failed: ' + errText.slice(0, 200) } }, apifyRes.status, origin, allowed);
  }

  const items = await apifyRes.json();
  const p = Array.isArray(items) ? items[0] : null;
  if (!p) {
    return json({ error: { message: 'Profile not found or is private' } }, 404, origin, allowed);
  }

  // 2. Compute real engagement rate from recent posts
  const posts = (p.latestPosts || p.posts || []).filter(x => typeof x.likesCount === 'number' || typeof x.likes === 'number');
  const likeOf = x => (typeof x.likesCount === 'number' ? x.likesCount : (x.likes || 0));
  const commentOf = x => (typeof x.commentsCount === 'number' ? x.commentsCount : (x.comments || 0));
  const avgLikes = posts.length ? posts.reduce((s, x) => s + likeOf(x), 0) / posts.length : 0;
  const avgComments = posts.length ? posts.reduce((s, x) => s + commentOf(x), 0) / posts.length : 0;
  // Apify may return the count under several names depending on actor version
  const followers = p.followersCount || p.followers_count || p.followers || p.edge_followed_by?.count || 0;
  const following = p.followsCount || p.follows_count || p.following || p.edge_follow?.count || 0;
  const totalPosts = p.postsCount || p.posts_count || p.edge_owner_to_timeline_media?.count || 0;
  const engagementPct = followers > 0 ? ((avgLikes + avgComments) / followers) * 100 : 0;

  // 3. Format follower count nicely
  const formatCount = n => {
    if (!n || n <= 0) return null;
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, '') + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, '') + 'K';
    return String(n);
  };

  // 4. Pull caption text from recent posts for interpretation
  const captions = posts.slice(0, 25).map(x => x.caption || '').filter(Boolean).join('\n---\n').slice(0, 4000);

  // 5. Ask OpenAI to interpret categories / vibes / themes from real captions
  let interpretation = { categories: [], vibes: [], topCategory: null, recentThemes: [] };
  if (captions) {
    const interpRes = await fetch(CHAT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + env.API_KEY },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.4,
        messages: [
          { role: 'system', content: 'You analyze Instagram post captions to identify content categories, vibes, and recurring themes. Return ONLY valid JSON, no markdown.' },
          { role: 'user', content: `Here are ${posts.length} recent captions from @${handle}:\n\n${captions}\n\nReturn this JSON:\n{\n  "topCategory": "primary category e.g. Fitness",\n  "categories": [{"name":"Fitness","pct":40},{"name":"Lifestyle","pct":30},{"name":"Beauty","pct":20},{"name":"Wellness","pct":10}],\n  "vibes": ["Aspirational","Warm Tones","Relatable","High Energy","Polished"],\n  "recentThemes": ["morning routines","gym workouts","product reviews","GRWM","day in my life"]\n}\n\nPct values must sum to 100. Give 4-5 categories, 5 vibes, 4-6 recent themes.` }
        ],
      }),
    });
    if (interpRes.ok) {
      const interpData = await interpRes.json();
      try {
        let txt = interpData.choices[0].message.content;
        txt = txt.replace(/```(?:json)?/g, '').replace(/```/g, '').trim();
        const m = txt.match(/\{[\s\S]*\}/);
        if (m) interpretation = { ...interpretation, ...JSON.parse(m[0]) };
      } catch (e) { /* keep empty interpretation */ }
    }
  }

  // Fetch the profile pic server-side and embed as base64 data URL,
  // since Instagram's CDN blocks direct browser loads from non-Instagram referrers.
  const picUrl = p.profilePicUrlHD || p.profilePicUrl || p.profile_pic_url_hd || p.profile_pic_url || null;
  let profilePicData = null;
  if (picUrl) {
    try {
      const picRes = await fetch(picUrl);
      if (picRes.ok) {
        const buf = await picRes.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = '';
        const chunk = 0x8000;
        for (let i = 0; i < bytes.byteLength; i += chunk) {
          binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
        }
        const b64 = btoa(binary);
        const contentType = picRes.headers.get('content-type') || 'image/jpeg';
        profilePicData = `data:${contentType};base64,${b64}`;
      }
    } catch (_) { /* fall through to URL */ }
  }

  // 6. Assemble the profile payload matching the frontend schema
  const profile = {
    username: '@' + (p.username || handle),
    displayName: p.fullName || p.full_name || p.username || handle,
    profilePicUrl: picUrl,
    profilePicData, // data URL — use this in <img src="...">, bypasses IG CDN referer checks
    followers: formatCount(followers),
    following: formatCount(following),
    totalPosts: formatCount(totalPosts),
    engagementRate: engagementPct > 0 ? (engagementPct < 1 ? engagementPct.toFixed(2) : engagementPct.toFixed(1)) + '%' : null,
    topCategory: interpretation.topCategory,
    categories: interpretation.categories,
    vibes: interpretation.vibes,
    bio: p.biography || p.bio || null,
    postingFrequency: postsCadence(posts),
    recentThemes: interpretation.recentThemes,
    verified: !!p.verified,
    // raw counts for any downstream math / debugging
    _raw: { followers, following, posts: totalPosts, avgLikes, avgComments, private: !!p.private, actorFields: Object.keys(p).slice(0, 30) },
  };

  // Return in the same shape the frontend expects from kimiChat
  return json({
    choices: [{ message: { role: 'assistant', content: JSON.stringify(profile) } }],
  }, 200, origin, allowed);
}

function postsCadence(posts) {
  if (!posts || posts.length < 2) return null;
  const times = posts.map(p => new Date(p.timestamp || p.takenAtTimestamp * 1000).getTime()).filter(t => !isNaN(t)).sort((a, b) => b - a);
  if (times.length < 2) return null;
  const dayMs = 86400000;
  const spanDays = (times[0] - times[times.length - 1]) / dayMs;
  const perDay = posts.length / Math.max(spanDays, 1);
  if (perDay >= 0.9) return 'Daily';
  if (perDay >= 0.4) return 'Several times per week';
  if (perDay >= 0.2) return 'Weekly';
  return 'Occasionally';
}

function json(obj, status, origin, allowed) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors(origin, allowed) },
  });
}

function cors(origin, allowed) {
  return {
    'Access-Control-Allow-Origin': allowed ? origin : 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
