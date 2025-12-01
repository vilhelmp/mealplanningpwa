import React, { useState, useRef, useEffect } from 'react';
import { Recipe, Language, MealPlanItem } from '../types';
import { Card, Button, Icons, Modal } from './Shared';
import { parseRecipeWithAI, summarizeFeedback, suggestNewDishes } from '../services/geminiService';

interface RecipesViewProps {
  recipes: Recipe[];
  plan?: MealPlanItem[];
  onAddRecipe: (recipe: Omit<Recipe, 'id' | 'images' | 'version'>) => void;
  onUpdateRecipe: (recipe: Recipe) => void;
  onDeleteRecipe: (id: number) => void;
  onAddMeal: (date: string, recipeId: number) => void;
  onSelectRecipe: (recipe: Recipe) => void;
  language: Language;
}

const TRANSLATIONS = {
  [Language.EN]: {
    title: "Recipes",
    saved: "saved",
    add: "Add Recipe",
    importTitle: "Add Recipe",
    importDesc: "Paste a URL, text, or upload a file (PDF/Image). AI will do the rest.",
    placeholder: "e.g., 'Spaghetti Carbonara' or paste full text...",
    parsing: "Parsing...",
    importBtn: "Import Recipe",
    uploadBtn: "Upload File",
    takePhoto: "Take Photo",
    or: "OR",
    fileSelected: "Selected:",
    clearFile: "Clear",
    menuTitle: "Recipe Options",
    edit: "Edit Recipe",
    delete: "Delete Recipe",
    cancel: "Cancel",
    confirmDelete: "Delete",
    deleteWarning: "Are you sure you want to delete this recipe?",
    viewFeedback: "View Feedback",
    feedbackTitle: "Recipe Feedback",
    noFeedback: "No ratings yet.",
    generatingSummary: "AI is summarizing comments...",
    summaryLabel: "AI Summary",
    recentComments: "Recent Comments",
    close: "Close",
    getIdeas: "Get Ideas",
    suggestTitle: "Dinner Ideas",
    suggestDesc: "Based on your favorite recipes, here are some suggestions you might like.",
    suggesting: "Looking for ideas...",
    noSuggestions: "Could not generate suggestions. Try again later."
  },
  [Language.SV]: {
    title: "Recept",
    saved: "sparade",
    add: "Nytt Recept",
    importTitle: "Lägg till recept",
    importDesc: "Klistra in URL, text eller ladda upp en fil (PDF/Bild). AI fixar resten.",
    placeholder: "t.ex. 'Köttbullar' eller klistra in text...",
    parsing: "Bearbetar...",
    importBtn: "Importera Recept",
    uploadBtn: "Ladda upp fil",
    takePhoto: "Ta bild",
    or: "ELLER",
    fileSelected: "Vald:",
    clearFile: "Rensa",
    menuTitle: "Alternativ",
    edit: "Redigera Recept",
    delete: "Ta bort Recept",
    cancel: "Avbryt",
    confirmDelete: "Ta bort",
    deleteWarning: "Är du säker på att du vill ta bort detta recept?",
    viewFeedback: "Visa Feedback",
    feedbackTitle: "Receptomdömen",
    noFeedback: "Inga betyg än.",
    generatingSummary: "AI sammanfattar kommentarer...",
    summaryLabel: "AI Sammanfattning",
    recentComments: "Senaste kommentarer",
    close: "Stäng",
    getIdeas: "Få tips",
    suggestTitle: "Middagsförslag",
    suggestDesc: "Baserat på dina favoritrecept, här är några förslag du kanske gillar.",
    suggesting: "Letar efter idéer...",
    noSuggestions: "Kunde inte generera förslag. Försök igen senare."
  }
};

export const RecipesView: React.FC<RecipesViewProps> = ({ recipes, plan = [], onAddRecipe, onSelectRecipe, onDeleteRecipe, language }) => {
  // --- Import State ---
  const [isImportOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importFile, setImportFile] = useState<{data: string, mimeType: string, name: string} | null>(null);
  const [isLoading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // --- Menu & Feedback State ---
  const [menuRecipe, setMenuRecipe] = useState<Recipe | null>(null);
  const [feedbackRecipe, setFeedbackRecipe] = useState<Recipe | null>(null);
  const [feedbackSummary, setFeedbackSummary] = useState<string>('');
  const [isSummarizing, setIsSummarizing] = useState(false);

  // --- Suggestions State ---
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  
  // --- Long Press Logic ---
  const timerRef = useRef<any>(null);
  const isLongPress = useRef(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const t = TRANSLATIONS[language];

  // Helper to get stats
  const getRecipeStats = (recipeId: number) => {
      const ratedMeals = plan.filter(p => p.recipe_id === recipeId && (p.rating || 0) > 0);
      const count = ratedMeals.length;
      const average = count > 0 
          ? ratedMeals.reduce((acc, curr) => acc + (curr.rating || 0), 0) / count 
          : 0;
      
      const comments = ratedMeals
          .map(p => p.rating_comment)
          .filter(c => c && c.trim().length > 0) as string[];

      return { average, count, comments };
  };

  // Effect to generate summary when feedback modal opens
  useEffect(() => {
      if (feedbackRecipe) {
          const stats = getRecipeStats(feedbackRecipe.id);
          if (stats.comments.length > 0) {
              setIsSummarizing(true);
              summarizeFeedback(feedbackRecipe.title, stats.comments)
                .then(summary => setFeedbackSummary(summary))
                .catch(() => setFeedbackSummary('Failed to load summary.'))
                .finally(() => setIsSummarizing(false));
          } else {
              setFeedbackSummary('');
          }
      }
  }, [feedbackRecipe, plan]); // Add plan dependency so it updates if plan changes

  const handlePointerDown = (recipe: Recipe) => {
      isLongPress.current = false;
      timerRef.current = setTimeout(() => {
          isLongPress.current = true;
          setMenuRecipe(recipe);
          if (navigator.vibrate) navigator.vibrate(50);
      }, 500); // 500ms for long press
  };

  const handlePointerUp = () => {
      if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
      }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type === 'text/plain') {
        // Read text file directly into textarea
        const text = await file.text();
        setImportText(text);
        // Clear file input so same file can be selected again if needed
        e.target.value = '';
        return;
    }

    // Handle PDF or Images
    const reader = new FileReader();
    reader.onload = (event) => {
        const result = event.target?.result as string;
        // Result is data:mime;base64,data...
        const base64Data = result.split(',')[1];
        setImportFile({
            data: base64Data,
            mimeType: file.type,
            name: file.name
        });
    };
    reader.readAsDataURL(file);
    // Clear input
    e.target.value = '';
  };

  const handleImport = async () => {
    if (!importText.trim() && !importFile) return;
    setLoading(true);
    setError('');
    
    try {
      const recipeData = await parseRecipeWithAI({
          text: importText,
          fileData: importFile?.data,
          mimeType: importFile?.mimeType
      });
      onAddRecipe(recipeData);
      setImportOpen(false);
      setImportText('');
      setImportFile(null);
    } catch (err) {
      setError('Failed to parse recipe. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteConfirm = () => {
      if (menuRecipe) {
          onDeleteRecipe(menuRecipe.id);
          setMenuRecipe(null);
      }
  };

  const handleSuggestRecipes = async () => {
      setIsSuggesting(true);
      setShowSuggestions(true);
      setSuggestions([]); // Clear previous

      try {
          // Identify Favorites:
          // 1. Calculate stats for all recipes
          // 2. Filter for those with rating >= 4 OR count >= 3 (arbitrary threshold for "frequent")
          // 3. Extract titles
          
          const favorites = recipes.filter(r => {
             const stats = getRecipeStats(r.id);
             // Also include if the base recipe has a manual rating >= 4 (from import/mock)
             return stats.average >= 4 || (r.rating || 0) >= 4 || stats.count >= 2; 
          }).map(r => r.title);

          const results = await suggestNewDishes(favorites);
          setSuggestions(results);
      } catch (e) {
          console.error(e);
      } finally {
          setIsSuggesting(false);
      }
  };

  // --- Main List Render ---
  return (
    <div className="pb-24 space-y-3">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-baseline gap-2">
          <h1 className="text-xl font-bold text-nordic-text">{t.title}</h1>
          <p className="text-nordic-muted text-xs">{recipes.length} {t.saved}</p>
        </div>
        <div className="flex gap-2">
            <Button onClick={handleSuggestRecipes} variant="secondary" className="!p-2 h-8 aspect-square text-nordic-accent">
                <Icons.Sparkles className="w-4 h-4" />
            </Button>
            <Button onClick={() => setImportOpen(true)} variant="primary" className="!p-2 h-8 aspect-square">
               <Icons.Plus className="w-4 h-4" />
            </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {recipes.map(recipe => {
            const stats = getRecipeStats(recipe.id);
            return (
              <Card 
                key={recipe.id} 
                className="group relative transition-transform active:scale-95 touch-callout-none select-none rounded-xl"
                onPointerDown={() => handlePointerDown(recipe)}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
                onContextMenu={(e: any) => e.preventDefault()}
                onClick={() => {
                    if (!isLongPress.current) {
                        onSelectRecipe(recipe);
                    }
                }}
              >
                <div className="aspect-square w-full relative bg-gray-100">
                   <img src={recipe.images[0]} className="w-full h-full object-cover" loading="lazy" />
                   <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-60" />
                   <div className="absolute bottom-2 left-2 right-2 text-white">
                     <p className="font-bold text-xs leading-tight line-clamp-2 mb-1">{recipe.title}</p>
                     <div className="flex items-center justify-between">
                        <span className="text-[9px] bg-black/20 backdrop-blur-sm px-1 py-0.5 rounded">{recipe.cuisine || 'General'}</span>
                        {stats.average > 0 && (
                            <div className="flex items-center gap-0.5 text-nordic-accent bg-black/20 backdrop-blur-sm px-1 py-0.5 rounded">
                                <Icons.Star className="w-2.5 h-2.5" fill={true} />
                                <span className="text-[9px] font-bold">{stats.average.toFixed(1)}</span>
                            </div>
                        )}
                     </div>
                   </div>
                </div>
              </Card>
            );
        })}
      </div>

      {/* --- Suggestions Modal --- */}
      <Modal isOpen={showSuggestions} onClose={() => setShowSuggestions(false)} title={t.suggestTitle}>
           <div className="space-y-4">
               <p className="text-sm text-gray-500">{t.suggestDesc}</p>
               
               {isSuggesting ? (
                   <div className="flex flex-col items-center justify-center py-8 gap-3 text-nordic-muted">
                       <Icons.Sparkles className="w-8 h-8 animate-spin text-nordic-accent" />
                       <p className="text-xs font-medium animate-pulse">{t.suggesting}</p>
                   </div>
               ) : suggestions.length > 0 ? (
                   <div className="space-y-2">
                       {suggestions.map((suggestion, idx) => (
                           <a 
                               key={idx}
                               href={`https://www.google.com/search?q=recipe+${encodeURIComponent(suggestion)}`}
                               target="_blank"
                               rel="noreferrer"
                               className="flex items-center justify-between p-3 bg-indigo-50 border border-indigo-100 rounded-xl hover:bg-indigo-100 transition-colors group"
                           >
                               <span className="text-sm font-bold text-indigo-900">{suggestion}</span>
                               <Icons.Link className="w-4 h-4 text-indigo-400 group-hover:text-indigo-600" />
                           </a>
                       ))}
                   </div>
               ) : (
                   <div className="text-center py-8 text-gray-400 text-sm">
                       {t.noSuggestions}
                   </div>
               )}
               
               <Button variant="ghost" onClick={() => setShowSuggestions(false)} className="w-full">
                   {t.close}
               </Button>
           </div>
      </Modal>

      {/* --- Context Menu Modal --- */}
      <Modal isOpen={!!menuRecipe} onClose={() => setMenuRecipe(null)} title={t.menuTitle}>
          {menuRecipe && (
              <div className="space-y-4">
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                      <img src={menuRecipe.images[0]} className="w-12 h-12 rounded-lg object-cover" />
                      <div>
                          <p className="font-bold text-nordic-text">{menuRecipe.title}</p>
                          {(() => {
                              const stats = getRecipeStats(menuRecipe.id);
                              if (stats.count > 0) {
                                  return (
                                      <p className="text-xs text-nordic-muted flex items-center gap-1 mt-1">
                                          <Icons.Star className="w-3 h-3 text-nordic-accent" fill={true} />
                                          {stats.average.toFixed(1)} ({stats.count})
                                      </p>
                                  );
                              }
                              return null;
                          })()}
                      </div>
                  </div>

                  <div className="space-y-3">
                      <Button 
                          variant="secondary" 
                          className="w-full"
                          onClick={() => {
                              const recipe = menuRecipe; // Capture reference
                              setMenuRecipe(null);
                              setFeedbackRecipe(recipe);
                          }}
                      >
                          <Icons.Star className="w-5 h-5 text-nordic-accent" /> {t.viewFeedback}
                      </Button>

                      <Button 
                          variant="secondary" 
                          className="w-full"
                          onClick={() => {
                              setMenuRecipe(null);
                              onSelectRecipe(menuRecipe);
                          }}
                      >
                          <Icons.Edit className="w-5 h-5" /> {t.edit}
                      </Button>
                      
                      <div className="border-t border-gray-100 my-2 pt-2">
                        <p className="text-xs text-center text-red-400 mb-2">{t.deleteWarning}</p>
                        <Button 
                            variant="danger" 
                            className="w-full"
                            onClick={handleDeleteConfirm}
                        >
                            <Icons.Trash className="w-5 h-5" /> {t.confirmDelete}
                        </Button>
                      </div>
                      
                      <Button variant="ghost" onClick={() => setMenuRecipe(null)} className="w-full">
                          {t.cancel}
                      </Button>
                  </div>
              </div>
          )}
      </Modal>

      {/* --- Feedback Modal --- */}
      <Modal isOpen={!!feedbackRecipe} onClose={() => setFeedbackRecipe(null)} title={t.feedbackTitle}>
          {feedbackRecipe && (() => {
               const stats = getRecipeStats(feedbackRecipe.id);
               return (
                   <div className="space-y-6">
                       {/* Header Stats */}
                       <div className="text-center">
                           {stats.count > 0 ? (
                               <>
                                   <div className="flex items-center justify-center gap-2 mb-2">
                                       <span className="text-5xl font-bold text-nordic-text">{stats.average.toFixed(1)}</span>
                                       <Icons.Star className="w-8 h-8 text-nordic-accent" fill={true} />
                                   </div>
                                   <p className="text-sm text-gray-500">{stats.count} ratings</p>
                               </>
                           ) : (
                               <p className="text-gray-500 py-4">{t.noFeedback}</p>
                           )}
                       </div>

                       {/* AI Summary */}
                       {stats.comments.length > 0 && (
                           <div className="bg-teal-50 p-4 rounded-xl border border-teal-100">
                               <h3 className="text-xs font-bold text-teal-800 uppercase tracking-wide mb-2 flex items-center gap-2">
                                   <Icons.Sparkles className="w-3 h-3" /> {t.summaryLabel}
                               </h3>
                               {isSummarizing ? (
                                   <p className="text-sm text-teal-600 italic animate-pulse">{t.generatingSummary}</p>
                               ) : (
                                   <p className="text-sm text-teal-900 leading-relaxed">
                                       {feedbackSummary}
                                   </p>
                               )}
                           </div>
                       )}

                       {/* Comments List */}
                       {stats.comments.length > 0 && (
                           <div>
                               <h3 className="font-bold text-sm text-nordic-text mb-3">{t.recentComments}</h3>
                               <div className="space-y-3 max-h-60 overflow-y-auto">
                                   {stats.comments.map((comment, idx) => (
                                       <div key={idx} className="bg-gray-50 p-3 rounded-lg text-sm text-gray-700">
                                           "{comment}"
                                       </div>
                                   ))}
                               </div>
                           </div>
                       )}

                       <Button variant="ghost" onClick={() => setFeedbackRecipe(null)} className="w-full">
                           {t.close || "Close"}
                       </Button>
                   </div>
               );
          })()}
      </Modal>

      {/* --- Import Modal --- */}
      <Modal isOpen={isImportOpen} onClose={() => {
        setImportOpen(false);
        setImportFile(null);
        setImportText('');
      }} title={t.importTitle}>
        <div className="space-y-4">
          <p className="text-sm text-gray-500">{t.importDesc}</p>
          
          <textarea 
            className="w-full h-32 p-3 rounded-xl bg-gray-50 border border-gray-200 focus:border-nordic-primary outline-none resize-none text-sm"
            placeholder={t.placeholder}
            value={importText}
            onChange={e => setImportText(e.target.value)}
          />

          <div className="relative flex py-1 items-center">
            <div className="flex-grow border-t border-gray-100"></div>
            <span className="flex-shrink-0 mx-4 text-xs text-gray-400 font-medium">{t.or}</span>
            <div className="flex-grow border-t border-gray-100"></div>
          </div>

          {!importFile ? (
            <div className="grid grid-cols-2 gap-3">
                <div onClick={() => fileInputRef.current?.click()} className="py-6 border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-nordic-primary hover:text-nordic-primary cursor-pointer transition-colors bg-gray-50/50">
                    <Icons.Upload className="w-6 h-6" />
                    <span className="text-xs font-medium">{t.uploadBtn}</span>
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        className="hidden" 
                        accept=".txt,.pdf,image/*" 
                        onChange={handleFileChange}
                    />
                </div>
                <div onClick={() => cameraInputRef.current?.click()} className="py-6 border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-nordic-primary hover:text-nordic-primary cursor-pointer transition-colors bg-gray-50/50">
                    <Icons.Camera className="w-6 h-6" />
                    <span className="text-xs font-medium">{t.takePhoto}</span>
                    <input 
                        type="file" 
                        ref={cameraInputRef} 
                        className="hidden" 
                        accept="image/*"
                        capture="environment"
                        onChange={handleFileChange}
                    />
                </div>
            </div>
          ) : (
             <div className="flex items-center justify-between p-3 bg-teal-50 border border-teal-100 rounded-xl">
                 <div className="flex items-center gap-3 overflow-hidden">
                     <div className="bg-white p-2 rounded-lg text-nordic-primary">
                        <Icons.Upload className="w-5 h-5" />
                     </div>
                     <div className="truncate">
                        <p className="text-xs text-gray-500">{t.fileSelected}</p>
                        <p className="text-sm font-medium text-nordic-primary truncate">{importFile.name}</p>
                     </div>
                 </div>
                 <button onClick={() => setImportFile(null)} className="p-2 hover:bg-white rounded-full transition-colors text-gray-500">
                     <Icons.X className="w-4 h-4" />
                 </button>
             </div>
          )}

          {error && <p className="text-xs text-red-500">{error}</p>}
          
          <Button 
            className="w-full" 
            onClick={handleImport} 
            disabled={isLoading || (!importText.trim() && !importFile)}
          >
            {isLoading ? (
                <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {t.parsing}
                </div>
            ) : t.importBtn}
          </Button>
        </div>
      </Modal>
    </div>
  );
};