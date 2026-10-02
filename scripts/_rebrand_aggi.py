import re
from pathlib import Path

root = Path(__file__).resolve().parents[2]
old = "https://agassist.netlify.app/assets/Logo%20CampoLead%20(1)-Photoroom.png"
new = "/brand/aggi-lockup.png"
htmls = [
    root / "CampoAI" / "public" / "cadastro" / "index.html",
    root / "CampoAI" / "public" / "entrar" / "index.html",
    root / "CampoAI" / "public" / "planos" / "index.html",
    root / "CampoAI" / "public" / "area-do-cliente" / "index.html",
]
for path in htmls:
    text = path.read_text(encoding="utf-8")
    text = text.replace(old, new)
    text = text.replace('alt="AG Assist"', 'alt="AGGI"')
    text = text.replace('aria-label="AG Assist — início"', 'aria-label="AGGI — início"')
    text = re.sub(r'\n\s*<span class="brand-text">AG Assist</span>', "", text)
    path.write_text(text, encoding="utf-8")
    print("logo", path.name)

rels = [
    "CampoAILanding/index.html",
    "CampoAILanding/docs/LANDING.md",
    "CampoAI/package.json",
    "CampoAI/app/package.json",
    "CampoAI/app/capacitor.config.ts",
    "CampoAI/app/android/app/src/main/assets/capacitor.config.json",
    "CampoAI/app/android/app/src/main/res/values/strings.xml",
    "CampoAI/src/rural/reports.js",
    "CampoAI/src/ai/policies/agentPolicy.js",
    "CampoAI/src/app.js",
    "CampoAI/src/services/signup/welcomeService.js",
    "CampoAI/src/services/llmPrompts.js",
    "CampoAI/public/planos/app.js",
    "CampoAI/src/services/userService.js",
    "CampoAI/scripts/previewApp.mjs",
    "CampoAI/src/controllers/billingController.js",
    "CampoAI/src/services/incomingMessageService.js",
    "CampoAI/src/services/signup/signupEmailService.js",
    "CampoAI/public/admin/app.js",
    "CampoAI/src/index.js",
    "CampoAI/src/swagger/openapi.js",
    "CampoAI/src/services/signup/signupService.js",
    "CampoAI/src/services/asaasSubscriptionService.js",
    "CampoAI/scripts/validate-prod-funnel.mjs",
    "CampoAI/scripts/sendSignupWelcomeEmailOnce.mjs",
    "CampoAI/src/services/signup/signupOtpService.js",
    "CampoAI/src/services/billing/phoneOtpService.js",
    "CampoAI/src/services/weeklyNewsContentService.js",
    "CampoAI/src/services/reportPdfService.js",
    "CampoAI/public/cadastro/index.html",
    "CampoAI/public/entrar/index.html",
    "CampoAI/public/planos/index.html",
    "CampoAI/public/area-do-cliente/index.html",
    "CampoAI/public/legal/termos-de-uso.html",
    "CampoAI/public/legal/politica-de-privacidade.html",
    "CampoAI/public/admin/index.html",
    "CampoAI/public/admin/login.html",
    "CampoAI/PRODUCT.md",
    "CampoAI/DESIGN.md",
]
for rel in rels:
    path = root / rel
    text = path.read_text(encoding="utf-8")
    count = text.count("AG Assist")
    if count:
        path.write_text(text.replace("AG Assist", "AGGI"), encoding="utf-8")
    print(f"{count:3} {rel}")
