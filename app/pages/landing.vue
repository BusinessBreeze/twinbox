<template>
  <div class="landing-page bg-slate-50 text-slate-900 min-h-screen">
    <!-- Hero Section with Background Parallax and Gradient Overlay -->
    <v-sheet
      min-height="95vh"
      class="hero-section workflow-section d-flex align-center py-16 position-relative"
      color="transparent"
    >
      <div class="workflow-overlay"></div>
      
      <v-container class="position-relative z-10">
        <v-row align="center">
          <v-col cols="12" md="6" class="pr-md-8">
            <v-chip
              color="primary"
              variant="flat"
              class="mb-6 font-weight-bold px-4 py-2 text-white"
              rounded="lg"
            >
              ✨ Meet TwinBox: Free & Open-Source
            </v-chip>
            <h1 class="text-h2 font-weight-black mb-6 hero-title leading-tight text-slate-900">
              Your Inbox.<br>
              <span class="gradient-text">AI Managed.</span>
            </h1>
            <p class="text-h6 mb-10 text-slate-700 leading-relaxed max-w-lg">
              TwinBox is a fully self-hosted, open-source mail orchestrator that parses, filters, synthesizes, and routes your incoming email traffic. Stay updated with custom digests sent directly to 150+ notification channels, or listen to audio overviews.
            </p>
            <div class="d-flex flex-wrap gap-4 align-center mb-4">
              <v-btn
                size="x-large"
                color="primary"
                to="/register"
                class="px-8 text-none elevate-hover font-weight-bold"
                rounded="lg"
                elevation="4"
              >
                Get Started Free
              </v-btn>
              <v-btn
                size="x-large"
                variant="outlined"
                color="primary"
                to="/login"
                class="px-8 text-none elevate-hover font-weight-bold"
                rounded="lg"
              >
                Sign In
              </v-btn>
            </div>
            <div class="text-caption text-slate-500 font-italic">
              100% open-source, privacy-first, and fully customizable.
            </div>
          </v-col>
          <v-col cols="12" md="6" class="mt-12 mt-md-0 d-flex justify-center position-relative">
            <!-- Mockup Showcase -->
            <div class="mockup-wrapper">
              <div class="mockup-border">
                <v-img
                  src="https://images.unsplash.com/photo-1563986768609-322da13575f3?q=80&w=1470&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"
                  class="mockup-img rounded-lg floating-animation"
                  cover
                  alt="TwinBox Interface Preview"
                ></v-img>
              </div>
              <div class="glow-accent"></div>
            </div>
          </v-col>
        </v-row>
      </v-container>
    </v-sheet>

    <!-- Value Propositions / Core Pillars -->
    <v-sheet class="py-24 bg-white position-relative" color="transparent">
      <v-container>
        <div class="text-center mb-16">
          <h2 class="text-h3 font-weight-black mb-4 text-slate-900">
            Next-Gen Inbox <span class="gradient-text-alt">Automation</span>
          </h2>
          <p class="text-h6 text-slate-600 max-w-xl mx-auto">
            Take complete control over your communication spools with local AI filters, TTS synthesis, and robust multi-channel alerts.
          </p>
          <v-divider
            length="80"
            thickness="4"
            color="primary"
            class="mx-auto mt-6 border-opacity-100 rounded-pill"
          ></v-divider>
        </div>

        <v-row class="mt-8">
          <!-- AI Mail Filtering -->
          <v-col cols="12" md="4">
            <v-card class="pa-8 h-100 feature-card glass-card" variant="flat" border>
              <div class="icon-wrapper mb-6 bg-blue-dim">
                <v-icon icon="mdi-filter-cog" size="32" color="primary"></v-icon>
              </div>
              <h3 class="text-h5 font-weight-bold mb-4 text-slate-900">AI Intent Filtering</h3>
              <p class="text-body-1 text-slate-600 leading-relaxed">
                Go beyond basic keyword queries. Filter, classify, and isolate newsletters, scams, updates, or receipts based on semantic intent and AI filters.
              </p>
            </v-card>
          </v-col>

          <!-- Content Overview & Artifacts -->
          <v-col cols="12" md="4">
            <v-card class="pa-8 h-100 feature-card glass-card" variant="flat" border>
              <div class="icon-wrapper mb-6 bg-orange-dim">
                <v-icon icon="mdi-file-document-outline" size="32" color="orange-darken-3"></v-icon>
              </div>
              <h3 class="text-h5 font-weight-bold mb-4 text-slate-900">Synthesis & Digests</h3>
              <p class="text-body-1 text-slate-600 leading-relaxed">
                Summarize dozens of emails in seconds. Create clean overview artifacts, fact summaries, or deep digests on request, compiled nicely into Markdown files.
              </p>
            </v-card>
          </v-col>

          <!-- Smart Mail Routing -->
          <v-col cols="12" md="4">
            <v-card class="pa-8 h-100 feature-card glass-card" variant="flat" border>
              <div class="icon-wrapper mb-6 bg-purple-dim">
                <v-icon icon="mdi-folder-move" size="32" color="purple-darken-3"></v-icon>
              </div>
              <h3 class="text-h5 font-weight-bold mb-4 text-slate-900">Smart Mail Routing</h3>
              <p class="text-body-1 text-slate-600 leading-relaxed">
                Automatically file and move emails into matching IMAP folders. Keep your primary inbox pristine and organize archives without manual effort.
              </p>
            </v-card>
          </v-col>
        </v-row>

        <v-row class="mt-8">
          <!-- Text-to-Speech (TTS) Mail -->
          <v-col cols="12" md="6">
            <v-card class="pa-8 h-100 feature-card glass-card" variant="flat" border>
              <v-row align="center" class="flex-column-reverse flex-sm-row">
                <v-col cols="12" sm="7">
                  <div class="icon-wrapper mb-6 bg-teal-dim">
                    <v-icon icon="mdi-volume-high" size="32" color="teal-darken-3"></v-icon>
                  </div>
                  <h3 class="text-h5 font-weight-bold mb-4 text-slate-900">Listen to Your Mail</h3>
                  <p class="text-body-1 text-slate-600 leading-relaxed">
                    Convert written email summaries into natural-sounding speech audio files. Listen to your daily inbox overview while commuting, cooking, or exercising.
                  </p>
                </v-col>
                <v-col cols="12" sm="5">
                  <v-img
                    src="https://images.unsplash.com/photo-1478737270239-2f02b77fc618?q=80&w=1470&auto=format&fit=crop"
                    class="rounded-lg shadow-md"
                    height="180"
                    cover
                  ></v-img>
                </v-col>
              </v-row>
            </v-card>
          </v-col>

          <!-- 150+ Apprise Notifications -->
          <v-col cols="12" md="6">
            <v-card class="pa-8 h-100 feature-card glass-card" variant="flat" border>
              <v-row align="center" class="flex-column-reverse flex-sm-row">
                <v-col cols="12" sm="7">
                  <div class="icon-wrapper mb-6 bg-pink-dim">
                    <v-icon icon="mdi-bell-ring" size="32" color="pink-darken-3"></v-icon>
                  </div>
                  <h3 class="text-h5 font-weight-bold mb-4 text-slate-900">150+ Apprise Outlets</h3>
                  <p class="text-body-1 text-slate-600 leading-relaxed">
                    Push alerts straight to where you work. Supports Discord, Slack, WhatsApp, Telegram, and 150+ other services via integrated open-source notifications.
                  </p>
                </v-col>
                <v-col cols="12" sm="5">
                  <v-img
                    src="https://images.unsplash.com/photo-1557200134-90327ee9fafa?q=80&w=1470&auto=format&fit=crop"
                    class="rounded-lg shadow-md"
                    height="180"
                    cover
                  ></v-img>
                </v-col>
              </v-row>
            </v-card>
          </v-col>
        </v-row>
      </v-container>
    </v-sheet>

    <!-- Workflow Section with Background Parallax and Gradient Overlay -->
    <v-sheet class="py-24 workflow-section position-relative" color="transparent">
      <div class="workflow-overlay"></div>
      <v-container class="position-relative z-10">
        <div class="text-center mb-16">
          <h2 class="text-h3 font-weight-black mb-4 text-slate-900">The TwinBox Pipeline</h2>
          <p class="text-h6 text-slate-700 max-w-xl mx-auto">
            From ingestion to final delivery—how TwinBox processes your incoming emails.
          </p>
        </div>

        <div class="pipeline-container d-flex flex-column flex-md-row justify-space-between align-stretch gap-6 position-relative">
          <div class="pipeline-step glass-card pa-6 text-center flex-1 rounded-lg border bg-white">
            <span class="step-num">01</span>
            <h4 class="text-h6 font-weight-bold my-4 text-slate-900">Ingestion</h4>
            <p class="text-body-2 text-slate-600">SMTP push listener or secure IMAP connections sync your folders instantly.</p>
          </div>
          <div class="pipeline-step glass-card pa-6 text-center flex-1 rounded-lg border bg-white">
            <span class="step-num">02</span>
            <h4 class="text-h6 font-weight-bold my-4 text-slate-900">AI Filtering</h4>
            <p class="text-body-2 text-slate-600">Local LLMs analyze intent and identify scams, newsletters, or critical alerts.</p>
          </div>
          <div class="pipeline-step glass-card pa-6 text-center flex-1 rounded-lg border bg-white">
            <span class="step-num">03</span>
            <h4 class="text-h6 font-weight-bold my-4 text-slate-900">Synthesis</h4>
            <p class="text-body-2 text-slate-600">Extract key items, restate your requests, and compile text summaries or TTS files.</p>
          </div>
          <div class="pipeline-step glass-card pa-6 text-center flex-1 rounded-lg border bg-white">
            <span class="step-num">04</span>
            <h4 class="text-h6 font-weight-bold my-4 text-slate-900">Dispatch</h4>
            <p class="text-body-2 text-slate-600">Forward organized mail or send markdown notifications directly to Discord/Slack/WhatsApp.</p>
          </div>
        </div>
      </v-container>
    </v-sheet>

    <!-- Bottom CTA -->
    <v-sheet class="py-24 workflow-section position-relative" color="transparent">
      <div class="workflow-overlay"></div>
      <v-container class="text-center position-relative z-10">
        <v-card
          color="transparent"
          class="pa-16 rounded-xl cta-card border overflow-hidden position-relative"
          elevation="4"
        >
          <div class="cta-bg-glow"></div>
          <v-row align="center" justify="center" class="position-relative z-10">
            <v-col cols="12" md="8">
              <h2 class="text-h3 font-weight-black mb-6 text-slate-900">Tame Your Inbox Today</h2>
              <p class="text-h6 mb-10 text-slate-700 max-w-lg mx-auto">
                Join TwinBox and configure custom rules to automatically organize, summarize, and route your emails.
              </p>
              <v-btn
                size="x-large"
                color="primary"
                variant="flat"
                to="/register"
                class="text-none px-12 font-weight-bold elevate-hover"
                rounded="lg"
              >
                Get Started for Free
              </v-btn>
            </v-col>
          </v-row>
        </v-card>
      </v-container>
    </v-sheet>
  </div>
</template>

<script setup lang="ts">
const { t } = useI18n()
</script>

<style scoped>
.landing-page {
  font-family: 'Outfit', 'Inter', sans-serif;
  overflow-x: hidden;
  background-color: #f8fafc;
}

/* Hero Section style override */
.hero-section {
  position: relative;
}

/* Workflow Section Background Parallax & Gradient Overlay */
.workflow-section {
  position: relative;
  background-image: url('https://images.unsplash.com/photo-1557200134-90327ee9fafa?q=80&w=1470&auto=format&fit=crop');
  background-attachment: fixed;
  background-size: cover;
  background-position: center;
}

.workflow-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(135deg, rgba(248, 250, 252, 0.95) 0%, rgba(248, 250, 252, 0.85) 100%);
  z-index: 1;
}

.hero-bg-glow {
  position: absolute;
  top: -10%;
  right: -5%;
  width: 50%;
  height: 60%;
  background: radial-gradient(circle, rgba(25, 118, 210, 0.08) 0%, transparent 70%);
  z-index: 2;
  pointer-events: none;
}

.gradient-text {
  background: linear-gradient(135deg, #1976D2 0%, #00bcd4 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.gradient-text-alt {
  background: linear-gradient(135deg, #e91e63 0%, #ff9800 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.hero-title {
  letter-spacing: -0.03em !important;
}

.max-w-lg {
  max-width: 520px;
}

.max-w-xl {
  max-width: 680px;
}

.mx-auto {
  margin-left: auto;
  margin-right: auto;
}

/* Mockup Interface Styles */
.mockup-wrapper {
  position: relative;
  width: 100%;
  max-width: 540px;
}

.mockup-border {
  position: relative;
  z-index: 5;
  border-radius: 16px;
  padding: 8px;
  background: linear-gradient(135deg, rgba(0,0,0,0.05), rgba(0,0,0,0.01));
  border: 1px solid rgba(0,0,0,0.08);
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.15);
}

.mockup-img {
  width: 100%;
  height: auto;
  border-radius: 10px;
  display: block;
}

.floating-animation {
  animation: float 6s ease-in-out infinite;
}

@keyframes float {
  0% { transform: translateY(0px); }
  50% { transform: translateY(-12px); }
  100% { transform: translateY(0px); }
}

.glow-accent {
  position: absolute;
  top: -20px;
  left: -20px;
  right: -20px;
  bottom: -20px;
  background: linear-gradient(135deg, #1976D2, #00bcd4);
  filter: blur(45px);
  opacity: 0.12;
  z-index: 1;
  border-radius: 20px;
}

/* Cards & Glassmorphism */
.glass-card {
  background: #ffffff !important;
  border: 1px solid #e2e8f0 !important;
  border-radius: 16px !important;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03) !important;
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1) !important;
}

.feature-card:hover {
  transform: translateY(-6px);
  border-color: rgba(25, 118, 210, 0.4) !important;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.08), 0 10px 10px -5px rgba(0, 0, 0, 0.04) !important;
}

/* Custom Icon Wrappers */
.icon-wrapper {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: 12px;
}

.bg-blue-dim { background: rgba(33, 150, 243, 0.1); }
.bg-orange-dim { background: rgba(255, 152, 0, 0.1); }
.bg-purple-dim { background: rgba(156, 39, 176, 0.1); }
.bg-teal-dim { background: rgba(0, 150, 136, 0.1); }
.bg-pink-dim { background: rgba(233, 30, 99, 0.1); }

/* Pipeline / Timeline Steps */
.pipeline-step {
  position: relative;
  z-index: 2;
  transition: all 0.3s ease;
}

.pipeline-step:hover {
  border-color: rgba(25, 118, 210, 0.4) !important;
}

.step-num {
  font-size: 2.5rem;
  font-weight: 900;
  color: rgba(25, 118, 210, 0.2);
  line-height: 1;
}

/* CTA Card styling */
.cta-card {
  background: rgba(255, 255, 255, 0.7) !important;
  backdrop-filter: blur(16px) !important;
  border: 1px solid rgba(255, 255, 255, 0.4) !important;
}

.cta-bg-glow {
  position: absolute;
  bottom: -20%;
  left: 30%;
  width: 40%;
  height: 50%;
  background: radial-gradient(circle, rgba(0, 188, 212, 0.08) 0%, transparent 60%);
  z-index: 1;
  pointer-events: none;
}

.elevate-hover {
  transition: all 0.3s ease;
}

.elevate-hover:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 16px rgba(25, 118, 210, 0.2);
}

.gap-4 {
  gap: 16px;
}

.gap-6 {
  gap: 24px;
}

.flex-1 {
  flex: 1;
}

.z-10 {
  z-index: 10;
}
</style>
