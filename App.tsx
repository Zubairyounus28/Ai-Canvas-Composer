import React, { useState, useCallback } from 'react';
import { Layout, Type, Image as ImageIcon, Wand2, Download, Upload, Move, CheckCircle2, Sparkles, Loader2, ChevronDown, FileType, Share2, MousePointer2, Sticker, Crop, MessageSquarePlus, Palette, Link, Archive, Undo, Redo, Trash2 } from 'lucide-react';
import html2canvas from 'html2canvas';
import JSZip from 'jszip';
import { CanvasEditor } from './components/CanvasEditor';
import { generateDesign, generateSticker, generateTypographyImage } from './services/geminiService';
import { fileToBase64, fileToDataUrl, removeBackground, dataURLToBlob } from './utils/helpers';
import { CanvasDimensions, DesignElement, AIAnalysisResult, Position } from './types';

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
  
  // Images
  const [bgImage, setBgImage] = useState<string | null>(null);
  const [bgFile, setBgFile] = useState<File | null>(null);
  const [logoImage, setLogoImage] = useState<string | null>(null);
  const [styleRefImage, setStyleRefImage] = useState<string | null>(null); // For style reference
  const [styleRefFile, setStyleRefFile] = useState<File | null>(null);
  const [imageUrlInput, setImageUrlInput] = useState(""); // For URL inputs

  // Inputs
  const [designPrompt, setDesignPrompt] = useState<string>("");
  const [objectPrompt, setObjectPrompt] = useState("");

  // Canvas State
  const [elements, setElements] = useState<DesignElement[]>([]);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  
  // History State
  const [history, setHistory] = useState<DesignElement[][]>([]);
  const [redoStack, setRedoStack] = useState<DesignElement[][]>([]);

  // Loading States
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGeneratingObject, setIsGeneratingObject] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  // Results
  const [analysisResult, setAnalysisResult] = useState<AIAnalysisResult | null>(null);
  
  // Download Options
  const [downloadScale, setDownloadScale] = useState(1);
  const [isTransparentMode, setIsTransparentMode] = useState(false);

  // --- Handlers ---

  const saveHistory = useCallback(() => {
    setHistory(prev => [...prev, elements]);
    setRedoStack([]); // Clear redo stack on new action
  }, [elements]);

  const handleUndo = useCallback(() => {
    if (history.length === 0) return;
    
    const previousState = history[history.length - 1];
    setRedoStack(prev => [elements, ...prev]);
    setElements(previousState);
    setHistory(prev => prev.slice(0, -1));
  }, [history, elements]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;

    const nextState = redoStack[0];
    setHistory(prev => [...prev, elements]);
    setElements(nextState);
    setRedoStack(prev => prev.slice(1));
  }, [redoStack, elements]);

  const handleDeleteSelected = useCallback(() => {
    if (!selectedElementId) return;
    saveHistory();
    setElements(prev => prev.filter(el => el.id !== selectedElementId));
    setSelectedElementId(null);
  }, [selectedElementId, saveHistory]);

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
      
      saveHistory(); // Save state before adding logo
      setLogoImage(url); // Store for potential AI use

      // Add logo to canvas immediately
      setElements(prev => {
        const existingLogo = prev.find(el => el.type === 'logo');
        if (existingLogo) {
          // Update content of existing logo
          setSelectedElementId(existingLogo.id);
          return prev.map(el => el.type === 'logo' ? { ...el, content: url } : el);
        } else {
          // Add new logo
          const newLogo: DesignElement = {
            id: 'main-logo',
            type: 'logo',
            content: url,
            x: dimensions.width - 180, // Default top-rightish
            y: 30,
            width: 150,
          };
          setSelectedElementId(newLogo.id);
          return [...prev, newLogo];
        }
      });
    }
  };

  const handleStyleRefUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];
      setStyleRefFile(file);
      const url = await fileToDataUrl(file);
      setStyleRefImage(url);
    }
  };

  const handleInsertUrlImage = () => {
    if (!imageUrlInput) return;
    saveHistory();

    // Basic check, though logic allows most strings as src
    const newElement: DesignElement = {
      id: `url-img-${Date.now()}`,
      type: 'image',
      content: imageUrlInput,
      x: dimensions.width / 2 - 100,
      y: dimensions.height / 2 - 100,
      width: 200,
    };
    
    setElements(prev => [...prev, newElement]);
    setSelectedElementId(newElement.id);
    setImageUrlInput(""); // Clear input
  };

  const handleGenerateAIObject = async () => {
    if (!objectPrompt) return;
    setIsGeneratingObject(true);
    saveHistory();

    try {
      const stickerBase64 = await generateSticker(objectPrompt);
      
      if (stickerBase64) {
        // Auto-remove background (assumes white background from prompt)
        const transparentSticker = await removeBackground(stickerBase64);

        const newElement: DesignElement = {
          id: `ai-obj-${Date.now()}`,
          type: 'image',
          content: transparentSticker,
          x: dimensions.width / 2 - 75,
          y: dimensions.height / 2 - 75,
          width: 150,
        };
        setElements(prev => [...prev, newElement]);
        setSelectedElementId(newElement.id);
        setObjectPrompt("");
      } else {
        alert("Failed to generate object. Please try again.");
      }
    } catch (e) {
      console.error(e);
      alert("Error generating object.");
    } finally {
      setIsGeneratingObject(false);
    }
  };

  // Generates Editable Text (JSON + CSS)
  const handleGenerateEditableDesign = async () => {
    if (!bgFile || !designPrompt) {
      alert("Please upload a background image and enter a prompt.");
      return;
    }
    
    setIsAnalyzing(true);
    saveHistory();
    
    try {
      const bgBase64 = await fileToBase64(bgFile);
      const styleBase64 = styleRefFile ? await fileToBase64(styleRefFile) : null;

      // Generates text content AND style
      const result = await generateDesign(bgBase64, designPrompt, styleBase64);
      setAnalysisResult(result);
      
      const newElements: DesignElement[] = [...elements];

      // Remove old main text if exists to replace it
      const filteredElements = newElements.filter(el => el.id !== 'main-text');

      // Add Text Element (Generated Content)
      const textPos = getCoordinatesFromPosition(result.suggestedTextPosition, dimensions.width, dimensions.height, 300, 100);
      filteredElements.push({
        id: `main-text-${Date.now()}`,
        type: 'text',
        content: result.textContent,
        x: textPos.x,
        y: textPos.y,
        style: {
          color: result.textColor,
          fontFamily: result.fontFamily,
          textShadow: result.textShadow === 'none' ? undefined : result.textShadow,
          fontSize: '64px',
        }
      });

      // Add Logo Element if uploaded and not present (and we haven't manually added it already)
      if (logoImage && !filteredElements.some(el => el.type === 'logo')) {
        const logoPos = getCoordinatesFromPosition(result.suggestedLogoPosition, dimensions.width, dimensions.height, 100, 100);
        filteredElements.push({
          id: 'main-logo',
          type: 'logo',
          content: logoImage,
          x: logoPos.x,
          y: logoPos.y,
          width: 150, 
        });
      }

      setElements(filteredElements);
    } catch (e) {
      console.error(e);
      alert("Something went wrong with the AI analysis. Please check your API key.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Generates Text as an Image (Typography Art)
  const handleGenerateTextArt = async () => {
    if (!designPrompt) {
      alert("Please enter a text prompt.");
      return;
    }

    setIsAnalyzing(true);
    saveHistory();

    try {
      const styleBase64 = styleRefFile ? await fileToBase64(styleRefFile) : null;
      const imageBase64 = await generateTypographyImage(designPrompt, styleBase64);

      if (imageBase64) {
        // Auto-remove background
        const transparentImage = await removeBackground(imageBase64);

        const newElement: DesignElement = {
          id: `text-art-${Date.now()}`,
          type: 'image',
          content: transparentImage,
          x: (dimensions.width - 400) / 2,
          y: (dimensions.height - 200) / 2,
          width: 400, // Default width for text art
        };
        setElements(prev => [...prev, newElement]);
        setSelectedElementId(newElement.id);
      } else {
        alert("Could not generate text art. Try a different prompt.");
      }
    } catch (e) {
      console.error(e);
      alert("Error generating text art.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleUpdateElement = useCallback((id: string, updates: Partial<DesignElement>) => {
    setHistory(prevHistory => {
        return [...prevHistory, elements];
    });
    setRedoStack([]);

    setElements(prev => prev.map(el => el.id === id ? { ...el, ...updates } : el));
  }, [elements]);

  // --- Download Helpers ---

  const performCapture = async (scale: number, transparent: boolean = false) => {
    const element = document.getElementById('canvas-export-target');
    if (!element) return null;

    // Deselect everything to hide anchors/borders
    const previousSelection = selectedElementId;
    setSelectedElementId(null);
    
    // Allow state to propagate (removing resize handles)
    await new Promise(resolve => setTimeout(resolve, 200));

    try {
      return await html2canvas(element, {
        scale: scale,
        useCORS: true,
        backgroundColor: transparent ? null : undefined, // Null ensures transparency
      });
    } finally {
      // Restore selection
      if(previousSelection) setSelectedElementId(previousSelection);
    }
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

  const handleDownloadSelection = async () => {
    if (isDownloading || !selectedElementId) return;
    
    setIsDownloading(true);
    setIsTransparentMode(true); // Reuse this flag to hide bg
    
    const originalElements = [...elements];
    // Filter to isolate the selected element
    setElements(elements.filter(e => e.id === selectedElementId));
    
    try {
      await new Promise(resolve => setTimeout(resolve, 200));

      const canvas = await performCapture(downloadScale, true); // Transparent
      if (canvas) {
        const link = document.createElement('a');
        link.download = `selection-${selectedElementId}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      }
    } catch (error) {
       console.error(error);
    } finally {
      setElements(originalElements); // Restore
      setIsTransparentMode(false);
      setIsDownloading(false);
    }
  };

  const handleDownloadTextOnly = async () => {
    if (isDownloading || elements.length === 0) return;
    
    setIsDownloading(true);
    setIsTransparentMode(true); // Switch to transparent mode

    // We do NOT filter by type here anymore. We want everything that is not the background.
    // This includes AI Stickers, AI Text Art, etc.
    // The "Text Only" button essentially behaves as "Download Overlay / Transparent Design".

    try {
      await new Promise(resolve => setTimeout(resolve, 250));
      const canvas = await performCapture(downloadScale, true); 
      if (canvas) {
        const link = document.createElement('a');
        link.download = `design-overlay-${dimensions.width}x${dimensions.height}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      }
    } catch (error) {
      console.error("Overlay download failed:", error);
    } finally {
      setIsTransparentMode(false); 
      setIsDownloading(false);
    }
  };

  const handleDownloadZip = async () => {
    if (isDownloading) return;
    setIsDownloading(true);

    try {
      const zip = new JSZip();

      // 1. Add Background Image if exists
      if (bgImage) {
        zip.file("background.png", dataURLToBlob(bgImage));
      }

      // 2. Add Logo Image if exists
      if (logoImage) {
        zip.file("logo.png", dataURLToBlob(logoImage));
      }

      // 3. Generate Overlay Layer (All elements, transparent bg)
      if (elements.length > 0) {
        setIsTransparentMode(true);
        // We do NOT filter by type here anymore. We want the full overlay.
        
        await new Promise(resolve => setTimeout(resolve, 250)); // Wait for render
        const overlayCanvas = await performCapture(downloadScale, true);
        if (overlayCanvas) {
           zip.file("design-overlay.png", dataURLToBlob(overlayCanvas.toDataURL('image/png')));
        }
        setIsTransparentMode(false);
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // 4. Save Individual Assets (AI Stickers / Text Art / Uploaded URL Images)
      // This satisfies "separate download" for individual AI elements
      elements.forEach((el, index) => {
        if (el.type === 'image' && el.content.startsWith('data:image')) {
            // It's a generated or uploaded base64 image
            zip.file(`assets/element-${index + 1}.png`, dataURLToBlob(el.content));
        }
      });

      // 5. Generate Full Composite Design
      const fullCanvas = await performCapture(downloadScale, false);
      if (fullCanvas) {
        zip.file("full-design.png", dataURLToBlob(fullCanvas.toDataURL('image/png')));
      }

      // Generate Zip Blob and Download
      const content = await zip.generateAsync({ type: "blob" });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(content);
      link.download = "canvas-design-package.zip";
      link.click();
      URL.revokeObjectURL(link.href);

    } catch (error) {
      console.error("Zip generation failed:", error);
      alert("Failed to create ZIP package.");
    } finally {
      setIsTransparentMode(false);
      setIsDownloading(false);
    }
  };

  const handleShareWhatsApp = async () => {
    if (isDownloading || !bgImage) return;
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
             if ((shareError as Error).name !== 'AbortError') console.error('Share failed', shareError);
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

  const selectedElement = elements.find(el => el.id === selectedElementId);

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
        <div className="lg:col-span-4 space-y-6 h-fit">
          
          {/* Section 1: Setup */}
          <section className="space-y-4 p-5 bg-zinc-900 rounded-xl border border-zinc-800 shadow-sm">
            <h2 className="text-lg font-semibold flex items-center gap-2 text-zinc-100">
              <Layout className="w-4 h-4 text-indigo-400" /> Canvas & Assets
            </h2>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-zinc-400 block mb-1">Width</label>
                <input 
                  type="number" 
                  value={dimensions.width}
                  onChange={(e) => setDimensions(prev => ({...prev, width: Number(e.target.value)}))}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" 
                />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-400 block mb-1">Height</label>
                <input 
                  type="number" 
                  value={dimensions.height}
                  onChange={(e) => setDimensions(prev => ({...prev, height: Number(e.target.value)}))}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" 
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col items-center justify-center p-3 border border-dashed border-zinc-700 rounded-lg cursor-pointer hover:border-indigo-500 hover:bg-zinc-800/50 transition-colors">
                <ImageIcon className="w-5 h-5 mb-1 text-zinc-500" />
                <span className="text-xs text-zinc-400">{bgImage ? 'Change Bg' : 'Add Background'}</span>
                <input type="file" className="hidden" accept="image/*" onChange={handleBgUpload} />
              </label>

              <label className="flex flex-col items-center justify-center p-3 border border-dashed border-zinc-700 rounded-lg cursor-pointer hover:border-indigo-500 hover:bg-zinc-800/50 transition-colors">
                <Upload className="w-5 h-5 mb-1 text-zinc-500" />
                <span className="text-xs text-zinc-400">{logoImage ? 'Change Logo' : 'Add Logo'}</span>
                <input type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} />
              </label>
            </div>
            
            {/* Insert Image via URL */}
            <div className="pt-2 border-t border-zinc-800">
              <label className="text-xs font-medium text-zinc-400 block mb-2">Insert Image via URL</label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  placeholder="https://example.com/image.png"
                  value={imageUrlInput}
                  onChange={(e) => setImageUrlInput(e.target.value)}
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" 
                />
                <button 
                  onClick={handleInsertUrlImage}
                  disabled={!imageUrlInput}
                  className="bg-zinc-800 hover:bg-zinc-700 text-indigo-400 p-2 rounded border border-zinc-700 disabled:opacity-50 transition-colors"
                  title="Add Image to Canvas"
                >
                  <Link className="w-4 h-4" />
                </button>
              </div>
            </div>
          </section>

          {/* Section 2: AI Text & Art Generation */}
          <section className="space-y-4 p-5 bg-zinc-900 rounded-xl border border-zinc-800 shadow-sm relative overflow-hidden">
             {/* Gradient Accent */}
             <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/10 rounded-bl-full pointer-events-none" />
             
             <h2 className="text-lg font-semibold flex items-center gap-2 text-zinc-100 relative z-10">
              <MessageSquarePlus className="w-4 h-4 text-indigo-400" /> AI Creative Assistant
            </h2>
            
            <div>
              <label className="text-xs font-medium text-zinc-400 block mb-2">
                Prompt for Text or Style
              </label>
              <textarea 
                rows={2}
                value={designPrompt}
                onChange={(e) => setDesignPrompt(e.target.value)}
                placeholder="e.g. 'Cyberpunk neon title' or 'Elegant wedding invite'"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-zinc-400 block mb-2">
                Style Reference Image (Optional)
              </label>
              <label className="flex items-center gap-3 p-2 border border-dashed border-zinc-700 rounded-lg cursor-pointer hover:bg-zinc-800/50 transition-colors">
                <div className="w-10 h-10 bg-zinc-800 rounded flex items-center justify-center border border-zinc-700">
                  {styleRefImage ? (
                    <img src={styleRefImage} alt="Ref" className="w-full h-full object-cover rounded" />
                  ) : (
                    <Palette className="w-5 h-5 text-zinc-500" />
                  )}
                </div>
                <div className="flex-1">
                   <div className="text-xs text-zinc-300">{styleRefImage ? 'Reference Loaded' : 'Upload Image for Style'}</div>
                   <div className="text-[10px] text-zinc-500">Influences colors & font vibe</div>
                </div>
                <input type="file" className="hidden" accept="image/*" onChange={handleStyleRefUpload} />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                onClick={handleGenerateEditableDesign}
                disabled={isAnalyzing || !bgImage || !designPrompt}
                className="py-2.5 px-3 rounded-lg flex flex-col items-center justify-center gap-1 font-medium text-xs bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 transition-all disabled:opacity-50"
              >
                {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Type className="w-4 h-4 text-indigo-400" />}
                <span>Editable Text</span>
              </button>

              <button
                onClick={handleGenerateTextArt}
                disabled={isAnalyzing || !designPrompt}
                className="py-2.5 px-3 rounded-lg flex flex-col items-center justify-center gap-1 font-medium text-xs bg-gradient-to-br from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-lg shadow-indigo-900/20 transition-all disabled:opacity-50"
              >
                {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-yellow-200" />}
                <span>Generate Text Image</span>
              </button>
            </div>
            <p className="text-[10px] text-zinc-500 text-center">
              "Editable Text" creates standard text. "Text Image" creates stylized art.
            </p>
          </section>
          
           {/* Section 3: AI Objects */}
           <section className="space-y-4 p-5 bg-zinc-900 rounded-xl border border-zinc-800 shadow-sm">
             <h2 className="text-lg font-semibold flex items-center gap-2 text-zinc-100">
              <Sticker className="w-4 h-4 text-pink-400" /> AI Objects
            </h2>
            <div className="flex gap-2">
              <input 
                value={objectPrompt}
                onChange={(e) => setObjectPrompt(e.target.value)}
                placeholder="e.g. 'retro sun', 'coffee cup'..."
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-pink-500 outline-none"
              />
              <button 
                onClick={handleGenerateAIObject}
                disabled={isGeneratingObject || !objectPrompt}
                className="bg-zinc-800 hover:bg-zinc-700 text-pink-400 p-2 rounded border border-zinc-700 disabled:opacity-50"
              >
                {isGeneratingObject ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              </button>
            </div>
           </section>

          {/* Section 4: Manual Controls (REFINED & CLEANED) */}
          {selectedElement && (
            <section className="space-y-4 p-5 bg-zinc-900 rounded-xl border border-zinc-800 shadow-sm animate-in fade-in slide-in-from-left-2">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                <h2 className="text-lg font-semibold flex items-center gap-2 text-zinc-100">
                  <MousePointer2 className="w-4 h-4 text-emerald-400" /> 
                  Edit {selectedElement.type === 'text' ? 'Text' : selectedElement.type === 'image' ? 'Image' : 'Logo'}
                </h2>
                <button 
                  onClick={handleDeleteSelected}
                  className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-md transition-colors"
                  title="Delete Selected Item"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                {/* Position Group */}
                <div>
                  <label className="text-[10px] font-bold text-zinc-500 mb-1.5 block uppercase tracking-wider">Position</label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-xs font-mono">X</span>
                      <input 
                        type="number" 
                        value={Math.round(selectedElement.x)}
                        onChange={(e) => handleUpdateElement(selectedElement.id, { x: Number(e.target.value) })}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-7 pr-3 py-2 text-sm focus:ring-1 focus:ring-emerald-500 outline-none text-zinc-300" 
                      />
                    </div>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-xs font-mono">Y</span>
                      <input 
                        type="number" 
                        value={Math.round(selectedElement.y)}
                        onChange={(e) => handleUpdateElement(selectedElement.id, { y: Number(e.target.value) })}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-7 pr-3 py-2 text-sm focus:ring-1 focus:ring-emerald-500 outline-none text-zinc-300" 
                      />
                    </div>
                  </div>
                </div>

                {/* Sizing Group */}
                <div>
                  <label className="text-[10px] font-bold text-zinc-500 mb-1.5 block uppercase tracking-wider">
                    {selectedElement.type === 'text' ? 'Typography' : 'Dimensions'}
                  </label>
                  <div className="grid grid-cols-1 gap-3">
                    {(selectedElement.type === 'logo' || selectedElement.type === 'image') && (
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-xs font-mono">W</span>
                        <input 
                          type="number" 
                          value={Math.round(selectedElement.width || 100)}
                          onChange={(e) => handleUpdateElement(selectedElement.id, { width: Number(e.target.value) })}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-7 pr-3 py-2 text-sm focus:ring-1 focus:ring-emerald-500 outline-none text-zinc-300" 
                        />
                      </div>
                    )}
                    
                    {selectedElement.type === 'text' && (
                       <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-xs font-mono">Sz</span>
                        <input 
                          type="number" 
                          value={parseInt(selectedElement.style?.fontSize as string || "64")}
                          onChange={(e) => handleUpdateElement(selectedElement.id, { style: { ...selectedElement.style, fontSize: `${e.target.value}px` } })}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-8 pr-3 py-2 text-sm focus:ring-1 focus:ring-emerald-500 outline-none text-zinc-300" 
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <button 
                onClick={handleDownloadSelection}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-zinc-800 hover:bg-zinc-750 text-emerald-400 border border-zinc-700/50 rounded-lg text-xs font-medium transition-colors mt-2"
              >
                <Crop className="w-3.5 h-3.5" /> 
                Download Isolated PNG
              </button>
            </section>
          )}

          {analysisResult && (
            <div className="p-4 bg-emerald-900/20 border border-emerald-800/50 rounded-lg text-sm text-emerald-100">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-400 shrink-0" />
                <div>
                  <p className="font-semibold mb-1">AI Design Applied</p>
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
            <div className="flex items-center gap-2">
               <button 
                 onClick={handleUndo} 
                 disabled={history.length === 0}
                 className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                 title="Undo"
               >
                 <Undo className="w-4 h-4" />
               </button>
               <button 
                 onClick={handleRedo} 
                 disabled={redoStack.length === 0}
                 className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                 title="Redo"
               >
                 <Redo className="w-4 h-4" />
               </button>
               <span className="w-px h-4 bg-zinc-700 mx-1"></span>
               <span className="text-xs text-zinc-500">Drag to move • Drag handle to resize</span>
            </div>
          </div>
          
          <CanvasEditor 
            dimensions={dimensions}
            backgroundImage={bgImage}
            elements={elements}
            onUpdateElement={handleUpdateElement}
            selectedId={selectedElementId}
            onSelect={setSelectedElementId}
            transparentBackground={isTransparentMode}
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
                disabled={isDownloading || !elements.some(e => e.type === 'text' || e.type === 'image')}
                className="flex items-center justify-center gap-2 px-3 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg transition-colors border border-zinc-700 text-xs"
                title="Download text overlay/art only (Transparent PNG)"
              >
                <FileType className="w-4 h-4" />
                <span>Text/Overlay Only</span>
              </button>

              <button 
                onClick={handleDownloadZip}
                disabled={isDownloading || !bgImage}
                className="flex items-center justify-center gap-2 px-3 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg transition-colors border border-zinc-700 text-xs"
                title="Download ZIP with separate layers"
              >
                <Archive className="w-4 h-4" />
                <span>ZIP</span>
              </button>
              
              <button 
                onClick={handleShareWhatsApp}
                disabled={isDownloading || !bgImage}
                className="flex items-center justify-center gap-2 px-3 py-2.5 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors shadow-lg shadow-green-900/20 text-xs"
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