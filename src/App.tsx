/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from "react";
import { Mic, MicOff, Volume2, RotateCcw, Send, Sparkles, User, Bot, History as HistoryIcon, Settings } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { getVaniResponse, saveLog } from "./services/ai";

interface Message {
  role: "user" | "bot";
  text: string;
  timestamp: Date;
}

export default function App() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [serverLogs, setServerLogs] = useState<any[]>([]);
  const [selectedLanguage, setSelectedLanguage] = useState<"hi-IN" | "te-IN">("hi-IN");
  const [textInput, setTextInput] = useState("");
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [preferredVoiceName, setPreferredVoiceName] = useState<string>("");
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);

  const messagesRef = useRef<Message[]>([]);
  
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const recognitionRef = useRef<any>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const activeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const [speechStatus, setSpeechStatus] = useState<"idle" | "priming" | "ready" | "speaking" | "error">("idle");
  const [activeVoiceInfo, setActiveVoiceInfo] = useState<string>("");
  const [isMuted, setIsMuted] = useState(false);
  const [audioNeedsActivation, setAudioNeedsActivation] = useState(true);
  const [systemStatusMessage, setSystemStatusMessage] = useState<{ text: string, type: 'error' | 'info' | 'success' } | null>(null);

  const primeSpeech = (force = false) => {
    if (!force && !audioNeedsActivation && speechStatus === "ready") return;
    
    try {
      setSpeechStatus("priming");
      window.speechSynthesis.cancel();
      
      const welcomeText = selectedLanguage === 'te-IN' 
        ? "నమస్కారం, వాణి వాయిస్ యాక్టివేట్ చేయబడింది." 
        : "नमस्ते, वाणी वॉइस एक्टिवेट हो गई है।";
        
      const utterance = new SpeechSynthesisUtterance(welcomeText);
      utterance.lang = selectedLanguage;
      utterance.volume = 1.0;
      utterance.rate = 1.0;
      
      // Attempt to pick a voice even for priming
      const voices = window.speechSynthesis.getVoices();
      const langPrefix = selectedLanguage.split('-')[0];
      const bestVoice = voices.find(v => v.lang.toLowerCase().replace(/_/g, '-').startsWith(langPrefix)) 
                     || voices.find(v => v.lang.toLowerCase().includes("in"));
      
      if (bestVoice) {
        utterance.voice = bestVoice;
        utterance.lang = bestVoice.lang;
        console.log(`Vani TTS Priming: Chose ${bestVoice.name}`);
      }
      
      utterance.onstart = () => {
        console.log("Vani TTS: Priming speech started");
        setSpeechStatus("speaking");
      };
      
      utterance.onend = () => {
        setSpeechStatus("ready");
        setAudioNeedsActivation(false);
        setActiveVoiceInfo(bestVoice ? bestVoice.name : "Vani Active");
        console.log("Vani TTS: Context primed");
      };
      
      utterance.onerror = (e) => {
        console.error("Vani TTS: Priming error", e);
        setSpeechStatus("ready");
        setAudioNeedsActivation(false);
      };
      
      window.speechSynthesis.resume();
      window.speechSynthesis.speak(utterance);
      
      // Fallback if events don't fire
      setTimeout(() => {
        setSpeechStatus("ready");
        setAudioNeedsActivation(false);
      }, 2000);
      
    } catch (e) {
      console.error("Speech priming failed", e);
      setSpeechStatus("error");
    }
  };

  useEffect(() => {
    const handleGlobalClick = () => {
      if (audioNeedsActivation && speechStatus !== 'priming') {
        console.log("Global click: Attempting to prime audio context");
        primeSpeech();
      }
    };
    
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, [audioNeedsActivation, speechStatus]);

  useEffect(() => {
    const updateVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        setAvailableVoices(voices);
      }
    };
    
    updateVoices();
    window.speechSynthesis.onvoiceschanged = updateVoices;

    // Periodic check for voices (fixes issues where onvoiceschanged doesn't fire)
    const voiceInterval = setInterval(updateVoices, 2000);
    
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
      clearInterval(voiceInterval);
    };
  }, []);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      if (recognitionRef.current) recognitionRef.current.stop();
      
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = selectedLanguage;

      recognitionRef.current.onresult = (event: any) => {
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            const finalTranscript = event.results[i][0].transcript;
            setTranscript("");
            handleSendMessage(finalTranscript);
          } else {
            interim += event.results[i][0].transcript;
          }
        }
        setTranscript(interim);
      };

      recognitionRef.current.onerror = () => setIsListening(false);
      recognitionRef.current.onend = () => {
        if (isListening) recognitionRef.current.start();
      };
    }
  }, [selectedLanguage, isListening]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, transcript]);

  const toggleListening = () => {
    primeSpeech();
    window.speechSynthesis.getVoices();
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      recognitionRef.current?.start();
    }
    setIsListening(!isListening);
  };

  const clearHistory = () => {
    setMessages([]);
    setTranscript("");
    setSystemStatusMessage({ text: "History cleared", type: 'success' });
    setTimeout(() => setSystemStatusMessage(null), 3000);
  };

  const handleSendMessage = async (text: string) => {
    if (isLoading) return;
    const messageText = text || textInput;
    if (!messageText.trim()) return;

    primeSpeech();
    window.speechSynthesis.getVoices(); 
    if (!text) setTextInput("");

    const userMessage: Message = { role: "user", text: messageText, timestamp: new Date() };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      // Filter out technical error fallback messages from history to prevent AI from learning to be "busy"
      const historyChunks = messagesRef.current
        .filter(m => !m.text.includes("క్షమించండి") && 
                     !m.text.includes("क्षमा करें") && 
                     !m.text.includes("busy") && 
                     !m.text.includes("మన్నించాలి"))
        .map(m => ({
          role: m.role === 'user' ? 'user' as const : 'model' as const,
          parts: [{ text: m.text }]
        }));

      const botResponseText = await getVaniResponse(messageText, historyChunks.slice(-10), selectedLanguage);
      const botMessage: Message = { role: "bot", text: botResponseText, timestamp: new Date() };
      
      setMessages((prev) => [...prev, botMessage]);
      saveLog(messageText, botResponseText);
      speak(botResponseText);
      setSystemStatusMessage(null);
    } catch (e: any) {
      console.error("Message sending failed:", e);
      // Detailed error if possible
      const errorStr = (e.message || String(e)).toLowerCase();
      let displayError = "Thinking process interrupted.";
      
      if (errorStr.includes("429")) displayError = "Quota exceeded. Wait 1-2 minutes.";
      else if (errorStr.includes("403") || errorStr.includes("forbidden")) displayError = "Access denied (Check API Key).";
      else if (errorStr.includes("404")) displayError = "Model unavailable.";
      else if (errorStr.includes("content_filter") || errorStr.includes("safety")) displayError = "Blocked by safety filters.";
      else displayError = `Vani Error: ${errorStr.substring(0, 40)}...`;

      setSystemStatusMessage({ text: displayError, type: 'error' });
      
      const isTeluguMode = selectedLanguage === 'te-IN';
      const fallbackVoiceMessage = isTeluguMode 
        ? "మన్నించాలి, సర్వర్ ప్రస్తుతం అందుబాటులో లేదు. దయచేసి మళ్ళీ ప్రయత్నించండి." 
        : "क्षमा करें, सर्वर अभी व्यस्त है। कृपया पुनः प्रयास करें।";
      
      // We still show it to user but it's filtered in next turn's history
      const errorMessage: Message = { role: "bot", text: fallbackVoiceMessage, timestamp: new Date() };
      
      setMessages((prev) => [...prev, errorMessage]);
      speak(fallbackVoiceMessage);
      
      setTimeout(() => setSystemStatusMessage(null), 10000);
    } finally {
      setIsLoading(false);
    }
  };

  const speak = (text: string) => {
    if (isMuted || !window.speechSynthesis) return;

    try {
        console.log(`Vani TTS: Request to speak "${text.substring(0, 30)}..."`);
        window.speechSynthesis.cancel();
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }

        setTimeout(() => {
          let voices = window.speechSynthesis.getVoices();
          if (voices.length === 0) {
            window.speechSynthesis.getVoices();
            voices = window.speechSynthesis.getVoices();
          }

          const utterance = new SpeechSynthesisUtterance(text);
          let lang = selectedLanguage;
          
          if (/[\u0C00-\u0C7F]/.test(text)) lang = "te-IN";
          else if (/[\u0900-\u097F]/.test(text)) lang = "hi-IN";
          
          utterance.lang = lang;
          const femaleNames = ["shruti", "kalpana", "vani", "shreya", "swara", "geeta", "heera", "pallavi", "sita", "anjali", "lekh", "neerja", "sangeeta", "zira", "natural", "meera"];
          
          let selectedVoice = voices.find(v => v.name === preferredVoiceName);
          if (!selectedVoice) {
            selectedVoice = voices.find(v => {
              const name = v.name.toLowerCase();
              const vLang = v.lang.toLowerCase().replace(/_/g, '-');
              const isMatch = vLang.startsWith(lang.split('-')[0]);
              const isFemale = femaleNames.some(fn => name.includes(fn)) || name.includes("female") || name.includes("woman");
              return isMatch && isFemale;
            });
          }

          if (!selectedVoice) selectedVoice = voices.find(v => v.lang.toLowerCase().replace(/_/g, '-').startsWith(lang.split('-')[0]));
          if (!selectedVoice) selectedVoice = voices.find(v => v.lang.toLowerCase().includes("in"));

          if (selectedVoice) {
            utterance.voice = selectedVoice;
            utterance.lang = selectedVoice.lang;
            setActiveVoiceInfo(selectedVoice.name);
          } else {
            setActiveVoiceInfo("Brave/Shielded");
          }

          utterance.pitch = 1.05;
          utterance.rate = 0.95; 
          utterance.volume = 1.0;
          
          utterance.onstart = () => setSpeechStatus("speaking");
          utterance.onend = () => setSpeechStatus("ready");
          utterance.onerror = () => {
            setSpeechStatus("ready");
            window.speechSynthesis.resume();
          };

          window.speechSynthesis.resume();
          window.speechSynthesis.speak(utterance);
          
          const resumeInterval = setInterval(() => {
            if (window.speechSynthesis.speaking) window.speechSynthesis.resume();
            else clearInterval(resumeInterval);
          }, 1000);
        }, 200);
    } catch (e) {
        setSpeechStatus("ready");
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await fetch("/api/logs");
      const data = await res.json();
      setServerLogs(data);
      setShowLogs(true);
    } catch (e) {
      console.error("Failed to fetch logs");
    }
  };

  return (
    <div className="h-screen w-full bg-[#0a0a0a] text-[#e5e7eb] flex flex-col font-sans overflow-hidden">
      <nav className="h-16 border-b border-white/10 flex items-center justify-between px-8 bg-[#0f0f0f] flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-pink-500 to-rose-400 flex items-center justify-center shadow-lg">
            <div className="w-3 h-3 bg-white rounded-full animate-pulse"></div>
          </div>
          <span className="text-lg font-semibold tracking-tight">VANI <span className="text-pink-400">AI</span></span>
          <span className="text-[10px] font-mono opacity-30 mt-1">v2.1 RESILIENT</span>
        </div>
        
        <div className="hidden sm:flex bg-white/5 p-1 rounded-full border border-white/10">
          <button onClick={() => setSelectedLanguage("hi-IN")} className={`px-4 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${selectedLanguage === "hi-IN" ? "bg-pink-500 text-white" : "text-white/40 hover:text-white"}`}>Hindi</button>
          <button onClick={() => setSelectedLanguage("te-IN")} className={`px-4 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${selectedLanguage === "te-IN" ? "bg-pink-500 text-white" : "text-white/40 hover:text-white"}`}>Telugu</button>
        </div>

        <div className="flex items-center gap-6 text-sm text-white/60">
          <button onClick={clearHistory} className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/30 hover:text-white" title="Clear Chat">
            <RotateCcw size={18} />
          </button>
          <button onClick={fetchLogs} className="p-2 hover:bg-white/10 rounded-full transition-colors"><HistoryIcon size={18} /></button>
          <button onClick={() => setIsMuted(!isMuted)} className={`p-2 rounded-full transition-all ${isMuted ? 'text-red-500 bg-red-500/10' : 'text-white/40 hover:bg-white/10'}`}>
            {isMuted ? <MicOff size={18} /> : <Volume2 size={18} />}
          </button>
          <button onClick={() => setShowVoiceSettings(!showVoiceSettings)} className={`p-2 rounded-full transition-all ${showVoiceSettings ? 'text-pink-500 bg-pink-500/10' : 'text-white/40 hover:bg-white/10'}`}>
            <Settings size={18} />
          </button>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${isListening ? 'bg-green-500 animate-pulse' : 'bg-white/20'}`}></span>
            <span className="hidden lg:inline font-mono text-[10px] uppercase tracking-wider">{isListening ? 'Listening' : 'Online'}</span>
          </div>
        </div>
      </nav>

      <main className="flex-1 flex overflow-hidden">
        <aside className={`w-64 border-r border-white/5 bg-[#0d0d0d] p-6 flex-col lg:flex ${showVoiceSettings ? 'flex absolute inset-y-0 left-0 z-50 bg-[#0d0d0d] shadow-2xl' : 'hidden'}`}>
          <div className="flex justify-between items-center mb-8">
            <h3 className="text-xs font-bold uppercase tracking-widest text-white/30">Voice Settings</h3>
            <button onClick={() => setShowVoiceSettings(false)} className="lg:hidden text-white/40">&times;</button>
          </div>
          <div className="space-y-6">
            <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
              <p className="text-[10px] text-white/40 uppercase mb-3 text-center">Voice Accent</p>
              <p className="text-xs font-medium text-center text-pink-300 mb-4">{selectedLanguage === 'hi-IN' ? 'Hindi (Indian)' : 'Telugu (Indian)'}</p>
              <select 
                value={preferredVoiceName} 
                onChange={(e) => setPreferredVoiceName(e.target.value)} 
                className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-[10px] outline-none mb-4"
              >
                <option value="">Auto Select Voice</option>
                {availableVoices.map((voice, idx) => (
                  <option key={idx} value={voice.name}>{voice.name} ({voice.lang})</option>
                ))}
              </select>
              <button 
                onClick={() => speak(selectedLanguage === 'hi-IN' ? "नमस्ते, मैं वाणी हूँ।" : "నమస్తే, నేను వాణిని.")}
                className="w-full py-2 bg-pink-500/20 text-pink-400 text-[10px] font-bold uppercase tracking-widest rounded-lg hover:bg-pink-500/30 transition-all border border-pink-500/20"
              >
                Test Voice
              </button>
            </div>

            <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
               <p className="text-[10px] text-white/40 uppercase mb-2">Speech Status</p>
               <div className="flex items-center gap-2 mb-2">
                 <div className={`w-1.5 h-1.5 rounded-full ${availableVoices.length > 0 ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`}></div>
                 <p className="text-[10px] font-mono text-white/60">
                   {availableVoices.length === 0 ? "No System Voices" : "Ready"}
                 </p>
               </div>
               <p className="text-[9px] font-mono text-white/30 truncate">{activeVoiceInfo || 'Ready to charm...'}</p>
            </div>
            
            <button 
              onClick={() => primeSpeech(true)}
              className="text-[10px] text-white/20 hover:text-white/40 transition-colors"
            >
              Force Re-prime Audio
            </button>
          </div>
        </aside>

        <section className="flex-1 flex flex-col relative overflow-hidden">
          <AnimatePresence>
            {audioNeedsActivation && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="bg-pink-500/10 border-b border-pink-500/20 px-6 py-2 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <Volume2 size={14} className="text-pink-400 group-hover:animate-bounce" />
                  <p className="text-[10px] font-bold uppercase tracking-widest text-pink-400">Audio Activation Required for Voice</p>
                </div>
                <button 
                  onClick={() => primeSpeech(true)}
                  className="px-3 py-1 bg-pink-500 text-white text-[9px] font-bold uppercase tracking-widest rounded-full hover:bg-pink-400 transition-colors shadow-lg shadow-pink-500/20"
                >
                  Activate Now
                </button>
              </motion.div>
            )}
            {systemStatusMessage && (
              <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="absolute top-4 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-2xl border bg-[#1a0a0a] border-red-500/50 text-red-400 text-xs shadow-2xl flex items-center gap-3 backdrop-blur-md"
              >
                <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></div>
                {systemStatusMessage.text}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 custom-scrollbar">
            <AnimatePresence>
              {messages.length === 0 && !transcript && (
                <div className="h-full flex flex-col items-center justify-center opacity-40">
                  <Bot size={64} className="mb-4 text-pink-500/20" />
                  <p className="text-sm italic">"Namaste! Type or Speak to begin..."</p>
                </div>
              )}
              {messages.map((msg, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${msg.role === 'user' ? 'bg-white/10' : 'bg-pink-500/20 text-pink-400'}`}>
                      {msg.role === 'user' ? <User size={14} /> : <Bot size={14} />}
                    </div>
                    <div className={`p-4 rounded-2xl relative group ${msg.role === 'user' ? 'bg-white/5 border border-white/10' : 'bg-[#151515] border border-white/5'}`}>
                      <p className="text-sm leading-relaxed">{msg.text}</p>
                      {msg.role === 'bot' && (
                        <button 
                          onClick={() => speak(msg.text)}
                          className="absolute -right-10 top-1/2 -translate-y-1/2 p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/5 text-white/40 hover:text-pink-400"
                          title="Speak again"
                        >
                          <Volume2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-pink-500/20 text-pink-400 flex items-center justify-center animate-pulse"><Bot size={14} /></div>
                    <div className="bg-[#151515] p-4 rounded-2xl flex gap-1">
                       <span className="w-1.5 h-1.5 bg-pink-500 rounded-full animate-bounce"></span>
                       <span className="w-1.5 h-1.5 bg-pink-500 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                    </div>
                  </div>
                </div>
              )}
            </AnimatePresence>
            <div ref={chatEndRef} />
          </div>

          <div className="p-6">
            <div className="max-w-3xl mx-auto flex items-end gap-4">
              <div className="flex-1 relative">
                <input 
                  type="text" 
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendMessage("")}
                  placeholder={selectedLanguage === 'hi-IN' ? "हिंदी में टाइप करें..." : "తెలుగులో టైప్ చేయండి..."}
                  className="w-full bg-[#151515] border border-white/10 rounded-2xl px-6 py-4 text-sm focus:outline-none focus:border-pink-500/50 pr-28"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-2">
                  <button 
                    onClick={() => primeSpeech(true)}
                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${speechStatus === 'speaking' ? 'text-pink-400 bg-pink-500/20' : 'text-white/40 hover:text-white'}`}
                    title="Test Voice"
                  >
                    <Volume2 size={18} />
                  </button>
                  <button onClick={() => handleSendMessage("")} className="w-10 h-10 bg-pink-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-pink-500/20"><Send size={18} /></button>
                </div>
              </div>
              <button onClick={toggleListening} className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${isListening ? "bg-rose-500 shadow-rose-500/40 animate-pulse" : "bg-white text-black"}`}>
                {isListening ? <MicOff size={24} /> : <Mic size={24} />}
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer className="h-12 bg-black border-t border-white/10 px-8 flex items-center justify-between text-[10px] text-white/30 uppercase tracking-[0.2em]">
        <div className="flex items-center gap-2">
             <span className={`w-1.5 h-1.5 rounded-full ${speechStatus === 'speaking' ? 'bg-green-500' : 'bg-pink-500'}`}></span>
             <span>{speechStatus === 'speaking' ? 'Speaking...' : 'Ready'}</span>
        </div>
        <span className="text-pink-500/60 font-bold">Secure Client</span>
      </footer>

      <AnimatePresence>
        {showLogs && (
          <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4">
            <div className="bg-[#0f0f0f] w-full max-w-2xl max-h-[80vh] rounded-3xl overflow-hidden flex flex-col border border-white/10">
              <div className="p-6 border-b border-white/10 flex justify-between items-center">
                <h3 className="font-bold text-xl flex items-center gap-2"><HistoryIcon className="text-pink-500" /> History</h3>
                <button onClick={() => setShowLogs(false)}>&times; Close</button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {serverLogs.map((log, i) => (
                  <div key={i} className="p-5 bg-white/5 rounded-2xl border border-white/5">
                    <p className="text-[10px] opacity-30 mb-2">{new Date(log.timestamp).toLocaleString()}</p>
                    <p className="text-xs mb-1"><span className="text-pink-400 font-bold tracking-widest mr-2 underline decoration-pink-500/30">USER</span> {log.user}</p>
                    <p className="text-xs"><span className="text-white/40 font-bold tracking-widest mr-2 underline decoration-white/10">VANI</span> {log.bot}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
