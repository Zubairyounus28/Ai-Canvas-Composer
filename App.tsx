import React, { useState, useCallback } from 'react';
import { Layout, Type, Image as ImageIcon, Wand2, Download, Upload, Move, CheckCircle2, Sparkles, Loader2, ChevronDown, FileType, Share2 } from 'lucide-react';
import html2canvas from 'html2canvas';
import { CanvasEditor } from './components/CanvasEditor';
import { analyzeImageAndSuggestStyle, generateCreativeCopy } from './services/geminiService';
import { fileToBase64, fileToDataUrl } from './utils/helpers';
import { CanvasDimensions, DesignElement, FontStyle, AIAnalysisResult, Position } from './types';

// Helper to convert named positions to coordinates
const getCoordinatesFromPosition = (
  pos: string, 
  canvasW: number, 
  canvasH: number, 
  itemW: number, 
  itemH: number
): Position => {
  const padding = 50;
  let x = padding;
  let y = padding;

  if (pos.includes('right')) x = canvasW - itemW - padding;
  if (pos.includes('center') && !pos.startsWith('center')) x = (canvasW - itemW) / 2; // horizontal center
  if (pos.startsWith('center')) {
      y = (canvasH - itemH) / 2;
      if(pos.includes('left')) x = padding;
      if(pos.includes('right')) x = canvasW - itemW - padding;
      if(pos === 'center') x = (canvasW - itemW) / 2;
  }
  
  if (pos.includes('bottom')) y = canvasH - itemH - padding;
  if (pos.includes('top')) y = padding;

  return { x, y };
};

const App: React.FC = () => {
  // --- State ---
  const [dimensions, setDimensions] = useState<CanvasDimensions>({ width: 800, height: 800 });
  const [bgImage, setBgImage] = useState<string | null>(null);
  const [bgFile, setBgFile] = useState<File | null>(null);
  const [logoImage, setLogoImage] = useState<string | null>(null);
  const [text, setText] = useState<string>("");
  const [stylePref, setStylePref] = useState<FontStyle>('Bold');
  
  const [elements, setElements] = useState<DesignElement[]>([]);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGeneratingText, setIsGeneratingText] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AIAnalysisResult | null>(null);
  
  const [downloadScale, setDownloadScale] = useState(1);
  const [isDownloading, setIsDownloading] = useState(false);
  
  // Controls render mode for export (standard vs text only)
  const [isTextOnlyMode, setIsTextOnlyMode] = useState(false);

  // --- Handlers ---

  const handleBgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];
      setBgFile(file);
      const url = await fileToDataUrl(file);
      setBgImage(url);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];
      const url = await fileToDataUrl(file);
      setLogoImage(url);
    }
  };

  const handleGenerateAIText = async () => {
    if (!text) return;
    setIsGeneratingText(true);
    const creativeText = await generateCreativeCopy(text);
    setText(creativeText);
    // Also update element if it exists
    setElements(prev => prev.map(el => el.type === 'text' ? { ...el, content: creativeText } : el));
    setIsGeneratingText(false);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setText(newText);
    setElements(prev => prev.map(el => el.type === 'text' ? { ...el, content: newText } : el));
  };

  const handleGenerateDesign = async () => {
    if (!bgFile || !text) {
      alert("Please upload a background image and enter text first.");
      return;
    }
    
    setIsAnalyzing(true);
    
    try {
      const base64 = await fileToBase64(bgFile);
      const result = await analyzeImageAndSuggestStyle(base64, text, stylePref);
      setAnalysisResult(result);
      
      // Create Elements based on AI suggestions
      const newElements: DesignElement[] = [];

      // Add Text Element
      const textPos = getCoordinatesFromPosition(result.suggestedTextPosition, dimensions.width, dimensions.height, 300, 100);
      newElements.push({
        id: 'main-text',
        type: 'text',
        content: text,
        x: textPos.x,
        y: textPos.y,
        style: {
          color: result.textColor,
          fontFamily: result.fontFamily,
          textShadow: result.textShadow === 'none' ? undefined : result.textShadow,
          fontSize: '64px', // Default starting size
          fontWeight: stylePref === 'Bold' ? 700 : 400,
        }
      });

      // Add Logo Element if uploaded
      if (logoImage) {
        const logoPos = getCoordinatesFromPosition(result.suggestedLogoPosition, dimensions.width, dimensions.height, 100, 100);
        newElements.push({
          id: 'main-logo',
          type: 'logo',
          content: logoImage,
          x: logoPos.x,
          y: logoPos.y,
          width: 150, // Default logo width
        });
      }

      setElements(newElements);
    } catch (e) {
      console.error(e);
      alert("Something went wrong with the AI analysis. Please check your API key.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleUpdateElement = useCallback((id: string, updates: Partial<DesignElement>) => {
    setElements(prev => prev.map(el => el.id === id ? { ...el, ...updates } : el));
  }, []);

  const performCapture = async (scale: number, transparent: boolean = false) => {
    const element = document.getElementById('canvas-export-target');
    if (!element) return null;

    // Deselect everything to hide anchors/borders
    setSelectedElementId(null);
    
    // Allow state to propagate (removing resize handles)
    await new Promise(resolve => setTimeout(resolve, 150));

    return await html2canvas(element, {
      scale: scale,
      useCORS: true,
      backgroundColor: transparent ? null : undefined, // Null ensures transparency
    });
  };

  const handleDownload = async () => {
    if (isDownloading || !bgImage) return;
    setIsDownloading(true);

    try {
      const canvas = await performCapture(downloadScale);
      if (canvas) {
        const link = document.createElement('a');
        link.download = `canvas-design-${dimensions.width * downloadScale}x${dimensions.height * downloadScale}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      }
    } catch (error) {
      console.error("Download failed:", error);
      alert("Could not generate image. Please try again.");
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDownloadTextOnly = async () => {
    if (isDownloading || !elements.some(e => e.type === 'text')) return;
    
    setIsDownloading(true);
    setIsTextOnlyMode(true); // Switch to text only mode (hides bg/logo)

    try {
      // Wait for React to render the text-only view
      await new Promise(resolve => setTimeout(resolve, 200));

      const canvas = await performCapture(downloadScale, true); // true = force transparent background
      if (canvas) {
        const link = document.createElement('a');
        link.download = `text-overlay-${dimensions.width}x${dimensions.height}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      }
    } catch (error) {
      console.error("Text download failed:", error);
    } finally {
      setIsTextOnlyMode(false); // Restore view
      setIsDownloading(false);
    }
  };

  const handleShareWhatsApp = async () => {
    if (isDownloading || !bgImage) return;
    
    // Check if Web Share API with files is supported
    if (!navigator.canShare) {
       alert("Sharing files is not supported on this browser. Downloading image instead.");
       handleDownload();
       return;
    }

    setIsDownloading(true);
    try {
      const canvas = await performCapture(downloadScale);
      if (!canvas) throw new Error("Capture failed");

      canvas.toBlob(async (blob) => {
        if (!blob) return;
        
        const file = new File([blob], "design.png", { type: "image/png" });
        const shareData = {
          files: [file],
          title: 'CanvasAI Design',
          text: 'Check out my design created with CanvasAI!',
        };

        if (navigator.canShare(shareData)) {
          try {
            await navigator.share(shareData);
          } catch (shareError) {
             if ((shareError as Error).name !== 'AbortError') {
               console.error('Share failed', shareError);
             }
          }
        } else {
          alert("Your device doesn't support sharing this image directly. Downloading instead.");
          handleDownload();
        }
      }, 'image/png');

    } catch (error) {
      console.error("Share failed:", error);
      alert("Could not share image.");
    } finally {
      setIsDownloading(false);
    }
  };

  // --- Render ---

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-indigo-500/30">
      
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-gradient-to-tr from-indigo-500 to-purple-500 p-2 rounded-lg">
              <Layout className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">CanvasAI Composer</h1>
          </div>
          <div className="flex items-center gap-4 text-sm text-zinc-400">
             <span>Powered by Gemini 2.5 Flash</span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Sidebar: Controls */}
        <div className="lg:col-span-4 space-y-8 h-fit">
          
          {/* Section 1: Setup */}
          <section className="space-y-4 p-5 bg-zinc-900 rounded-xl border border-zinc-800 shadow-sm">
            <h2 className="text-lg font-semibold flex items-center gap-2 text-zinc-100">
              <Layout className="w-4 h-4 text-indigo-400" /> Canvas & Assets
            </h2>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-zinc-400 block mb-1">Width (px)</label>
                <input 
                  type="number" 
                  value={dimensions.width}
                  onChange={(e) => setDimensions(prev => ({...prev, width: Number(e.target.value)}))}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" 
                />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-400 block mb-1">Height (px)</label>
                <input 
                  type="number" 
                  value={dimensions.height}
                  onChange={(e) => setDimensions(prev => ({...prev, height: Number(e.target.value)}))}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" 
                />
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-zinc-400 block mb-1">Background Image</label>
                <label className="flex items-center justify-center w-full h-16 border-2 border-dashed border-zinc-700 rounded-lg cursor-pointer hover:border-indigo-500 hover:bg-zinc-800/50 transition-colors group">
                  <div className="flex items-center gap-2 text-zinc-500 group-hover:text-indigo-400">
                    <ImageIcon className="w-4 h-4" />
                    <span className="text-sm">{bgImage ? 'Change Image' : 'Upload Image'}</span>
                  </div>
                  <input type="file" className="hidden" accept="image/*" onChange={handleBgUpload} />
                </label>
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-400 block mb-1">Logo (Optional)</label>
                <label className="flex items-center justify-center w-full h-16 border-2 border-dashed border-zinc-700 rounded-lg cursor-pointer hover:border-indigo-500 hover:bg-zinc-800/50 transition-colors group">
                  <div className="flex items-center gap-2 text-zinc-500 group-hover:text-indigo-400">
                    <Upload className="w-4 h-4" />
                    <span className="text-sm">{logoImage ? 'Change Logo' : 'Upload Logo'}</span>
                  </div>
                  <input type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} />
                </label>
              </div>
            </div>
          </section>

          {/* Section 2: Content & Style */}
          <section className="space-y-4 p-5 bg-zinc-900 rounded-xl border border-zinc-800 shadow-sm">
             <h2 className="text-lg font-semibold flex items-center gap-2 text-zinc-100">
              <Type className="w-4 h-4 text-indigo-400" /> Text & Style
            </h2>
            
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-medium text-zinc-400">Overlay Text or Prompt</label>
                <button 
                  onClick={handleGenerateAIText}
                  disabled={isGeneratingText || !text}
                  className="text-xs flex items-center gap-1 text-indigo-400 hover:text-indigo-300 disabled:opacity-50"
                  title="Generate creative text from your input"
                >
                  {isGeneratingText ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  AI Magic
                </button>
              </div>
              <textarea 
                rows={3}
                value={text}
                onChange={handleTextChange}
                placeholder="Enter text or a prompt (e.g., 'Coffee shop summer sale')..."
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-zinc-400 block mb-2">Preferred Font Style</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {(['Script', 'Bold', 'Regular', 'Modern', 'Monospace'] as FontStyle[]).map(style => (
                  <button
                    key={style}
                    onClick={() => setStylePref(style)}
                    className={`px-3 py-2 text-xs rounded border transition-all ${
                      stylePref === style 
                      ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-900/50' 
                      : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
                    }`}
                  >
                    {style}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Action Button */}
          <button
            onClick={handleGenerateDesign}
            disabled={isAnalyzing || !bgImage || !text}
            className={`w-full py-4 rounded-xl flex items-center justify-center gap-2 font-semibold text-white transition-all transform active:scale-95 ${
              isAnalyzing || !bgImage || !text
              ? 'bg-zinc-800 cursor-not-allowed text-zinc-500' 
              : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 shadow-lg shadow-indigo-900/20'
            }`}
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Analyzing Image...</span>
              </>
            ) : (
              <>
                <Wand2 className="w-5 h-5" />
                <span>Generate Composition</span>
              </>
            )}
          </button>

          {analysisResult && (
            <div className="p-4 bg-emerald-900/20 border border-emerald-800/50 rounded-lg text-sm text-emerald-100">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-400 shrink-0" />
                <div>
                  <p className="font-semibold mb-1">AI Suggestion Applied</p>
                  <p className="text-emerald-200/80 leading-relaxed text-xs">
                    {analysisResult.fontReasoning}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Area: Canvas */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          <div className="bg-zinc-900 rounded-t-xl border border-zinc-800 border-b-0 p-4 flex items-center justify-between">
            <h3 className="font-medium text-zinc-200 flex items-center gap-2">
              <Move className="w-4 h-4" /> Visual Editor
            </h3>
            <span className="text-xs text-zinc-500">Drag to move • Drag corner handle to resize</span>
          </div>
          
          <CanvasEditor 
            dimensions={dimensions}
            backgroundImage={bgImage}
            elements={elements}
            onUpdateElement={handleUpdateElement}
            selectedId={selectedElementId}
            onSelect={setSelectedElementId}
            textOnlyMode={isTextOnlyMode}
          />

          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-zinc-900 p-4 rounded-b-xl border border-zinc-800 border-t-0">
            <div className="relative inline-flex items-center w-full sm:w-auto">
              <span className="absolute left-3 text-zinc-400 text-xs font-medium">Resolution:</span>
              <select 
                value={downloadScale}
                onChange={(e) => setDownloadScale(Number(e.target.value))}
                className="w-full sm:w-auto appearance-none bg-zinc-800 hover:bg-zinc-750 text-white pl-20 pr-8 py-2.5 rounded-lg border border-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm cursor-pointer"
              >
                <option value={1}>1x (Standard)</option>
                <option value={2}>2x (High Res)</option>
                <option value={4}>4x (Ultra HD)</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
            </div>

            <div className="flex flex-wrap gap-2 w-full sm:w-auto justify-end">
              <button 
                onClick={handleDownloadTextOnly}
                disabled={isDownloading || !elements.some(e => e.type === 'text')}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg transition-colors border border-zinc-700 text-sm"
                title="Download text only (Transparent PNG)"
              >
                <FileType className="w-4 h-4" />
                <span>Text Only</span>
              </button>
              
              <button 
                onClick={handleShareWhatsApp}
                disabled={isDownloading || !bgImage}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors shadow-lg shadow-green-900/20 text-sm"
                title="Share via WhatsApp (Mobile)"
              >
                <Share2 className="w-4 h-4" />
                <span>Share</span>
              </button>

              <button 
                onClick={handleDownload}
                disabled={isDownloading || !bgImage}
                className={`flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors shadow-lg shadow-indigo-900/20 text-sm ${isDownloading ? 'opacity-70 cursor-wait' : ''}`}
              >
                {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                <span>Download</span>
              </button>
            </div>
          </div>
        </div>

      </main>
    </div>
  );
};

export default App;