"use client";

import Image from "next/image";
import { useState } from "react";

const t = {
  en: {
    nav_download: "Download",
    nav_github: "GitHub",
    hero_badge: "v1.0.29 — FREE",
    hero_title_1: "Your meetings, understood by AI.",
    hero_title_2: "Locally.",
    hero_sub: "Real-time transcription and AI analysis running entirely on your computer. No cloud. No subscriptions. Your conversations stay yours.",
    download_mac: "Download for macOS",
    download_win: "Download for Windows",

    features_title: "Why Meeting Helper?",
    f1_title: "Real-time Transcription",
    f1_desc: "Local Whisper-powered speech-to-text. Every word captured as it happens.",
    f2_title: "AI Analysis",
    f2_desc: "Question and answer detection from your meetings.",
    f3_title: "100% Private",
    f3_desc: "No cloud, no API calls. All data stays on your machine.",
    f4_title: "Multi-language",
    f4_desc: "Auto-detects spoken language. Works with Portuguese, English, Spanish, and more.",
    setup_title: "Getting Started",
    step1_title: "1. Install Ollama",
    step1_desc: "Download and install",
    step1_link: "Ollama.dmg",
    step1_after: ". This runs the AI models locally on your Mac.",
    step2_title: "2. Pull a model",
    step2_desc: "Open Terminal and run:",
    step2_note: "First request after launch takes ~5-15s to load the model into memory (warmup). After that, responses are fast.",
    step3_title: "3. Download & open Meeting Helper",
    step3_desc: "Download the .dmg, drag Meeting Helper to Applications, and open it.",
    step4_title: "4. Grant permissions",
    step4_desc_1: "macOS will ask for audio permissions. Go to",
    step4_desc_2: "System Settings → Privacy & Security → Screen & System Audio Recording",
    step4_desc_3: "and enable Meeting Helper. You may also need to enable it under",
    step4_desc_4: "System Audio Recording Only",
    step4_desc_5: "for capturing system audio (meeting apps, etc).",
    step5_title: "5. Start recording",
    step5_desc: "Select your audio source (mic or system audio), hit Record, and let AI do the rest.",
    download_title: "Download Meeting Helper",
    download_sub: "Free and private. macOS and Windows.",
    req_title: "Requirements",
    req_macos: "macOS 12+ / Windows 10+",
    req_ram: "8 GB+ RAM",
    req_ollama: "Ollama installed",
    footer_built: "Made free by",
    
    warmup_title: "About model warmup",
    warmup_desc: "When you first start Meeting Helper (or after Ollama restarts), the AI model needs to be loaded into memory. The first analysis request may take 5-15 seconds. After that, all subsequent requests are fast. This is normal — the model stays loaded while Meeting Helper is running.",
  },
  pt: {
    nav_download: "Baixar",
    nav_github: "GitHub",
    hero_badge: "v1.0.29 — GRATUITO",
    hero_title_1: "Suas reuniões, entendidas por IA.",
    hero_title_2: "Localmente.",
    hero_sub: "Transcrição em tempo real e análise por IA rodando inteiramente no seu computador. Sem nuvem. Sem assinaturas. Suas conversas permanecem suas.",
    download_mac: "Baixar para macOS",
    download_win: "Baixar para Windows",

    features_title: "Por que o Meeting Helper?",
    f1_title: "Transcrição em Tempo Real",
    f1_desc: "Speech-to-text local com Whisper. Cada palavra capturada conforme é dita.",
    f2_title: "Análise por IA",
    f2_desc: "Detecção de perguntas e respostas das suas reuniões.",
    f3_title: "100% Privado",
    f3_desc: "Sem nuvem, sem chamadas de API. Todos os dados ficam na sua máquina.",
    f4_title: "Multi-idioma",
    f4_desc: "Detecta automaticamente o idioma falado. Funciona com português, inglês, espanhol e mais.",
    setup_title: "Como Começar",
    step1_title: "1. Instale o Ollama",
    step1_desc: "Baixe e instale o",
    step1_link: "Ollama.dmg",
    step1_after: ". Ele roda os modelos de IA localmente no seu Mac.",
    step2_title: "2. Baixe um modelo",
    step2_desc: "Abra o Terminal e execute:",
    step2_note: "A primeira requisição após iniciar leva ~5-15s para carregar o modelo na memória (warmup). Depois disso, as respostas são rápidas.",
    step3_title: "3. Baixe e abra o Meeting Helper",
    step3_desc: "Baixe o .dmg, arraste o Meeting Helper para Aplicativos e abra.",
    step4_title: "4. Conceda permissões",
    step4_desc_1: "O macOS pedirá permissões de áudio. Vá em",
    step4_desc_2: "Ajustes do Sistema → Privacidade e Segurança → Gravação de Tela e Áudio do Sistema",
    step4_desc_3: "e ative o Meeting Helper. Talvez também precise ativar em",
    step4_desc_4: "Gravação de Áudio do Sistema Apenas",
    step4_desc_5: "para capturar áudio do sistema (apps de reunião, etc).",
    step5_title: "5. Comece a gravar",
    step5_desc: "Selecione a fonte de áudio (microfone ou áudio do sistema), clique em Gravar e deixe a IA fazer o resto.",
    download_title: "Baixar o Meeting Helper",
    download_sub: "Gratuito e privado. macOS e Windows.",
    req_title: "Requisitos",
    req_macos: "macOS 12+ / Windows 10+",
    req_ram: "8 GB+ de RAM",
    req_ollama: "Ollama instalado",
    footer_built: "Feito de graça por",
    
    warmup_title: "Sobre o warmup do modelo",
    warmup_desc: "Quando você inicia o Meeting Helper pela primeira vez (ou após reiniciar o Ollama), o modelo de IA precisa ser carregado na memória. A primeira análise pode levar 5-15 segundos. Depois disso, todas as requisições seguintes são rápidas. Isso é normal — o modelo permanece carregado enquanto o Meeting Helper estiver rodando.",
  },
} as const;

type Lang = keyof typeof t;

const DOWNLOAD_URL = "/download/Meeting%20Helper-1.0.17-arm64.dmg";
const WINDOWS_URL = "https://github.com/allanhal/helper/releases/latest";
const REPO_URL = "https://github.com/allanhal/helper";

function AppleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  );
}

function WindowsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M0 3.449L9.75 2.1v9.451H0zm11.0 9.451H24V0L11.0 1.85zm-11.0 1.101H9.75V24L0 22.1zm11.0 0H24V24L11.0 22.799z" />
    </svg>
  );
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

export default function Home() {
  const [copied, setCopied] = useState(false);
  const [lang, setLang] = useState<Lang>("pt");
  const s = t[lang];

  const copyCommand = () => {
    navigator.clipboard.writeText("ollama pull gemma4:e4b");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen overflow-x-hidden">
      {/* Navbar */}
      <nav className="fixed top-0 z-50 w-full border-b border-white/[0.06] bg-[#0a0a0a]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <a href="#" className="flex items-center gap-2 text-base sm:text-lg font-semibold text-white">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-sm font-bold text-black">H</span>
            <span className="hidden sm:inline">Meeting Helper</span>
            <span className="sm:hidden">Helper</span>
          </a>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setLang(lang === "en" ? "pt" : "en")}
              className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:text-white hover:border-white/20"
            >
              {lang === "en" ? "🇧🇷 PT" : "🇺🇸 EN"}
            </button>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:text-white hover:border-white/20"
              aria-label={s.nav_github}
            >
              <GitHubIcon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{s.nav_github}</span>
            </a>
            <a href="#download" className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-black hover:bg-accent-hover">
              {s.nav_download}
            </a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden pt-32 pb-16 sm:pt-40 sm:pb-24">
        <div className="hero-glow animate-glow-pulse absolute left-1/2 top-20 -translate-x-1/2" aria-hidden="true" />
        <div className="relative mx-auto max-w-5xl px-6 text-center">
          <span className="animate-fade-in-up mb-6 inline-block rounded-full border border-accent/20 bg-accent/5 px-4 py-1.5 text-sm text-emerald-400">
            {s.hero_badge}
          </span>
          <h1 className="animate-fade-in-up delay-100 mx-auto max-w-3xl text-4xl font-bold leading-tight text-white sm:text-5xl md:text-6xl">
            {s.hero_title_1} <span className="text-accent">{s.hero_title_2}</span>
          </h1>
          <p className="animate-fade-in-up delay-200 mx-auto mt-6 max-w-2xl text-lg text-zinc-400">
            {s.hero_sub}
          </p>
          <div className="animate-fade-in-up delay-300 mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a href={DOWNLOAD_URL} className="inline-flex items-center gap-2 rounded-full bg-accent px-8 py-3.5 text-base font-semibold text-black hover:bg-accent-hover hover:shadow-[0_0_24px_rgba(34,197,94,0.3)]">
              <AppleIcon className="h-5 w-5" />
              {s.download_mac}
            </a>
            <a href={WINDOWS_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-8 py-3.5 text-base font-semibold text-white hover:bg-white/10 hover:border-white/20">
              <WindowsIcon className="h-5 w-5" />
              {s.download_win}
            </a>
          </div>

          <Image src="/screenshot.jpg" alt="Helper app" width={1920} height={1080} className="mx-auto mt-14 w-full max-w-4xl rounded-xl" priority />
        </div>
      </section>

      {/* Features — compact grid */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-center text-2xl font-bold text-white sm:text-3xl">{s.features_title}</h2>
          <div className="mt-12 grid gap-6 sm:grid-cols-2">
            {[
              { icon: "🎙️", title: s.f1_title, desc: s.f1_desc },
              { icon: "🧠", title: s.f2_title, desc: s.f2_desc },
              { icon: "🔒", title: s.f3_title, desc: s.f3_desc },
              { icon: "🌍", title: s.f4_title, desc: s.f4_desc },
            ].map((f) => (
              <div key={f.title} className="glass-card rounded-2xl p-5">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{f.icon}</span>
                  <div>
                    <h3 className="font-semibold text-white">{f.title}</h3>
                    <p className="mt-1 text-sm text-zinc-400">{f.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Setup Guide */}
      <section id="setup" className="border-y border-white/[0.06] py-16 sm:py-20">
        <div className="mx-auto max-w-3xl px-6">
          <h2 className="text-center text-2xl font-bold text-white sm:text-3xl">{s.setup_title}</h2>
          <div className="mt-12 space-y-8">
            {/* Step 1 */}
            <div className="glass-card rounded-2xl p-5">
              <h3 className="font-semibold text-accent">{s.step1_title}</h3>
              <p className="mt-2 text-sm text-zinc-400">
                {s.step1_desc}{" "}
                <a href="https://ollama.com/download/Ollama.dmg" target="_blank" rel="noopener noreferrer" className="text-accent underline hover:text-accent-hover">
                  {s.step1_link}
                </a>
                {s.step1_after}
              </p>
            </div>

            {/* Step 2 */}
            <div className="glass-card rounded-2xl p-5">
              <h3 className="font-semibold text-accent">{s.step2_title}</h3>
              <p className="mt-2 text-sm text-zinc-400">{s.step2_desc}</p>
              <div className="mt-3 flex items-center gap-3">
                <code className="flex-1 overflow-x-auto rounded-lg bg-black/50 px-3 sm:px-4 py-3 text-xs sm:text-sm text-emerald-400 font-mono whitespace-nowrap">
                  ollama pull gemma4:e4b
                </code>
                <button
                  onClick={copyCommand}
                  className={`shrink-0 rounded-lg border px-3 py-3 transition-all duration-200 ${
                    copied
                      ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
                      : "border-white/10 bg-white/5 text-zinc-400 hover:text-white hover:border-white/20"
                  }`}
                  aria-label="Copy command"
                >
                  {copied ? (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  )}
                </button>
              </div>
              <p className="mt-3 text-xs text-zinc-500 italic">{s.step2_note}</p>
            </div>

            {/* Step 3 */}
            <div className="glass-card rounded-2xl p-5">
              <h3 className="font-semibold text-accent">{s.step3_title}</h3>
              <p className="mt-2 text-sm text-zinc-400">{s.step3_desc}</p>
              <div className="mt-3 flex flex-wrap gap-3">
                <a href={DOWNLOAD_URL} className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-black hover:bg-accent-hover">
                  <AppleIcon className="h-4 w-4" />
                  {s.download_mac}
                </a>
                <a href={WINDOWS_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-2 text-sm font-semibold text-white hover:bg-white/10 hover:border-white/20">
                  <WindowsIcon className="h-4 w-4" />
                  {s.download_win}
                </a>
              </div>
            </div>

            {/* Step 4 — Permissions */}
            <div className="glass-card rounded-2xl p-5">
              <h3 className="font-semibold text-accent">{s.step4_title}</h3>
              <p className="mt-2 text-sm text-zinc-400">
                {s.step4_desc_1} <strong className="text-zinc-300">{s.step4_desc_2}</strong> {s.step4_desc_3} <strong className="text-zinc-300">{s.step4_desc_4}</strong> {s.step4_desc_5}
              </p>
              
            </div>

            {/* Step 5 */}
            <div className="glass-card rounded-2xl p-5">
              <h3 className="font-semibold text-accent">{s.step5_title}</h3>
              <p className="mt-2 text-sm text-zinc-400">{s.step5_desc}</p>
            </div>

            {/* Warmup note */}
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5">
              <h3 className="font-semibold text-amber-400">💡 {s.warmup_title}</h3>
              <p className="mt-2 text-sm text-zinc-400">{s.warmup_desc}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Download CTA */}
      <section id="download" className="py-16 sm:py-20">
        <div className="mx-auto max-w-5xl px-6 text-center">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">{s.download_title}</h2>
          <p className="mt-3 text-zinc-400">{s.download_sub}</p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a href={DOWNLOAD_URL} className="inline-flex items-center gap-2 rounded-full bg-accent px-8 sm:px-10 py-4 text-base sm:text-lg font-semibold text-black hover:bg-accent-hover hover:shadow-[0_0_32px_rgba(34,197,94,0.3)]">
              <AppleIcon className="h-6 w-6" />
              {s.download_mac}
            </a>
            <a href={WINDOWS_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-8 sm:px-10 py-4 text-base sm:text-lg font-semibold text-white hover:bg-white/10 hover:border-white/20">
              <WindowsIcon className="h-6 w-6" />
              {s.download_win}
            </a>
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-zinc-500">
            <span>{s.req_macos}</span>
            <span className="hidden sm:inline">|</span>
            <span>{s.req_ram}</span>
            <span className="hidden sm:inline">|</span>
            <span>{s.req_ollama}</span>
          </div>
          <div className="mt-4">
            <span className="inline-block rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-mono text-zinc-400">v1.0.29</span>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] py-8">
        <div className="mx-auto flex max-w-5xl items-center justify-center px-6">
          <a
            href="https://www.linkedin.com/in/allanaraujopinheiro/"
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-2.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-5 py-2.5 text-sm text-zinc-400 transition-all hover:border-blue-500/30 hover:bg-blue-500/5 hover:text-white"
          >
            <svg className="h-4 w-4 text-zinc-500 transition-colors group-hover:text-[#0a66c2]" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
            </svg>
            {s.footer_built} <span className="font-medium text-zinc-300 transition-colors group-hover:text-white">Allan Pinheiro</span>
          </a>
        </div>
      </footer>
    </div>
  );
}
