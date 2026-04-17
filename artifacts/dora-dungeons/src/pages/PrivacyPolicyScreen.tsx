import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, Shield } from "lucide-react";

export function PrivacyPolicyScreen() {
  const [, navigate] = useLocation();

  return (
    <div
      className="min-h-screen w-full flex flex-col relative overflow-hidden"
      style={{ background: "#060810" }}
    >
      <div className="dungeon-bg" />
      <div className="vignette" />
      <div className="scanline-overlay" />

      {/* Navbar */}
      <header className="dd-navbar">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 transition-colors"
          style={{ color: "rgba(200,155,60,0.6)", background: "none", border: "none", cursor: "pointer" }}
          onMouseEnter={e => (e.currentTarget.style.color = "#c89b3c")}
          onMouseLeave={e => (e.currentTarget.style.color = "rgba(200,155,60,0.6)")}
          aria-label="Go back"
        >
          <ArrowLeft size={16} />
          <span className="font-code text-xs uppercase tracking-widest">Back</span>
        </button>

        <div className="dd-navbar-center">
          <Shield size={14} style={{ color: "rgba(200,155,60,0.6)" }} />
          <span
            className="font-display text-xs uppercase tracking-widest"
            style={{ color: "rgba(200,155,60,0.75)", letterSpacing: "0.25em" }}
          >
            Privacy Policy
          </span>
        </div>

        <div style={{ width: 64 }} />
      </header>

      {/* Content */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 flex-1 overflow-y-auto"
        style={{ padding: "1.5rem 1rem 3rem" }}
      >
        <div style={{ maxWidth: 680, margin: "0 auto" }}>

          {/* Header card */}
          <div className="terminal-panel mb-6" style={{ padding: "1.5rem 1.75rem" }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="terminal-dot" style={{ background: "#c89b3c" }} />
              <div className="terminal-dot" style={{ background: "rgba(200,155,60,0.4)" }} />
              <div className="terminal-dot" style={{ background: "rgba(200,155,60,0.2)" }} />
              <span
                className="font-code text-xs uppercase tracking-widest ml-2"
                style={{ color: "rgba(200,155,60,0.5)" }}
              >
                dora-dungeons :: privacy.log
              </span>
            </div>
            <h1
              className="font-display mb-1"
              style={{
                fontSize: "clamp(1.1rem, 3vw, 1.6rem)",
                background: "linear-gradient(135deg, #a87830 0%, #f0d060 50%, #a87830 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                letterSpacing: "0.15em",
              }}
            >
              Privacy Policy
            </h1>
            <p className="font-narration" style={{ color: "rgba(200,185,160,0.55)", fontSize: "0.85rem" }}>
              Effective date: April 2026 · App version: 1.0
            </p>
          </div>

          {/* Sections */}
          {[
            {
              title: "1. Who We Are",
              content: `Dora Dungeons is an audio-first dungeon RPG developed for iOS. The game is designed to be fully accessible via voice commands and text-to-speech narration.

Contact: support@doradungeons.com`,
            },
            {
              title: "2. Information We Collect",
              content: `We collect only what is necessary to provide the game:

• Email address — used solely to identify your account and restore your game session. We only accept Gmail addresses.
• Character name — the name you choose for your in-game character.
• Game session data — your current dungeon level, inventory, equipment, health, gold, and progress. Stored securely in our database.

We do not collect: payment information, location data, device identifiers, contact lists, photos, or any other personal data beyond the above.`,
            },
            {
              title: "3. Voice & Audio",
              content: `Dora Dungeons uses your device's built-in Web Speech API for voice recognition. All voice processing happens on-device through Apple's native speech framework. We do not record, store, or transmit any audio data to our servers.

Text-to-speech narration is generated on-device. No audio is sent externally.`,
            },
            {
              title: "4. How We Use Your Information",
              content: `Your email is used to:
• Create and authenticate your account (passwordless — no password is ever stored).
• Restore your game session when you return.
• Respond to support requests if you contact us.

We do not sell, rent, or share your data with third parties for advertising or marketing purposes.`,
            },
            {
              title: "5. Data Storage & Security",
              content: `Your account and game session data is stored on secured servers with encryption in transit (HTTPS/TLS). We retain your data for as long as your account is active. When you delete your account, all associated data is permanently and immediately removed from our servers.`,
            },
            {
              title: "6. Account Deletion",
              content: `You may permanently delete your account and all associated data at any time. Use the "Delete Account" button on the login screen and confirm with your email address.

Upon deletion: your account record, character name, game session, progress, inventory, and all stored data are irreversibly erased. This action cannot be undone.

Alternatively, email us at support@doradungeons.com with the subject "Delete My Account".`,
            },
            {
              title: "7. Children's Privacy",
              content: `Dora Dungeons is not directed at children under 13. We do not knowingly collect personal information from children. If you believe a child has provided us information, contact us at support@doradungeons.com and we will delete it immediately.`,
            },
            {
              title: "8. Changes to This Policy",
              content: `We may update this Privacy Policy as the app evolves. We will notify users of material changes via an in-app notice. The effective date at the top of this document will always reflect the latest revision.`,
            },
            {
              title: "9. Contact",
              content: `Questions, concerns, or data requests:
Email: support@doradungeons.com
Subject line: "Privacy Inquiry"

We aim to respond within 48 hours.`,
            },
          ].map((section, i) => (
            <motion.div
              key={section.title}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * i, duration: 0.35 }}
              className="glass-panel mb-4"
              style={{ padding: "1.25rem 1.5rem" }}
            >
              <h2
                className="font-display mb-3"
                style={{
                  fontSize: "0.75rem",
                  letterSpacing: "0.2em",
                  color: "#c89b3c",
                  borderBottom: "1px solid rgba(200,155,60,0.15)",
                  paddingBottom: "0.5rem",
                  marginBottom: "0.75rem",
                }}
              >
                {section.title}
              </h2>
              <p
                className="font-narration"
                style={{
                  color: "rgba(220,210,190,0.8)",
                  fontSize: "0.95rem",
                  lineHeight: 1.75,
                  whiteSpace: "pre-line",
                }}
              >
                {section.content}
              </p>
            </motion.div>
          ))}

          {/* Footer */}
          <div className="rune-divider my-6">⬡</div>
          <p
            className="font-code text-center"
            style={{ color: "rgba(200,155,60,0.3)", fontSize: "0.65rem", letterSpacing: "0.12em" }}
          >
            DORA DUNGEONS · PRIVACY POLICY · v1.0
          </p>
        </div>
      </motion.div>
    </div>
  );
}
