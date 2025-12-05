import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Recipe, Language, MealPlanItem } from '../types';
import { Card, Button, Icons, Modal, Input } from './Shared';
import { parseRecipeWithAI, summarizeFeedback, suggestNewDishes } from '../services/geminiService';

interface RecipesViewProps {
  recipes: Recipe[];
  plan?: MealPlanItem[];
  onAddRecipe: (recipe: Omit<Recipe, 'id' | 'images' | 'version'>) => void;
  onUpdateRecipe: (recipe: Recipe) => void;
  onDeleteRecipe: (id: number) => void;
  onAddMeal: (date: string, recipeId: number) => void;
  onSelectRecipe: (recipe: Recipe) => void;
  t: any;
  language: string;
}

interface FilterState {
    cuisines: string[];
    ingredientSearch: string;
    onlySpicy: boolean;
    minRating: number;
    dietary: string[];
}

const SPICY_KEYWORDS = ['chili', 'chilli', 'jalapeno', 'jalapeño', 'habanero', 'cayenne', 'sriracha', 'sambal', 'tabasco', 'hot sauce', 'spicy', 'curry', 'masala', 'piri piri', 'harissa'];
const FISH_KEYWORDS = ['salmon', 'tuna', 'cod', 'fish', 'shrimp', 'prawn', 'crab', 'lobster', 'seafood', 'trout', 'haddock', 'scallop', 'mussel', 'clam', 'anchovy', 'sardine'];

export const RecipesView: React.FC<RecipesViewProps> = ({ recipes, plan = [], onAddRecipe, onSelectRecipe, onDeleteRecipe, t, language }) => {
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
  
  // --- Filter State ---
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<FilterState>({
      cuisines: [],
      ingredientSearch: '',
      onlySpicy: false,
      minRating: 0,
      dietary: []
  });

  // --- Long Press Logic ---
  const timerRef = useRef<any>(null);
  const isLongPress = useRef(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

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
  
  // Helper to determine spiciness
  const isRecipeSpicy = (r: Recipe) => {
      const text = (r.title + ' ' + r.description + ' ' + r.ingredients.map(i=>i.item_name).join(' ')).toLowerCase();
      return SPICY_KEYWORDS.some(k => text.includes(k));
  }

  // Helper to determine dietary type
  const getDietaryType = (r: Recipe): string => {
      const meatIngredients = r.ingredients.filter(i => 
          ['Meat', 'Fish', 'Poultry', 'Seafood'].includes(i.category)
      );

      if (meatIngredients.length === 0) return 'Vegetarian';

      const names = meatIngredients.map(i => i.item_name.toLowerCase()).join(' ');
      if (FISH_KEYWORDS.some(k => names.includes(k))) return 'Fish';
      
      return 'Meat';
  }

  // Derive unique cuisines for filter
  const allCuisines = useMemo(() => {
      const set = new Set<string>();
      recipes.forEach(r => {
          if (r.cuisine) set.add(r.cuisine);
      });
      return Array.from(set).sort();
  }, [recipes]);

  // Derived filtered list
  const filteredRecipes = useMemo(() => {
      return recipes.filter(r => {
          // Cuisine Filter
          if (filters.cuisines.length > 0 && (!r.cuisine || !filters.cuisines.includes(r.cuisine))) {
              return false;
          }
          
          // Ingredient Filter
          if (filters.ingredientSearch.trim()) {
              const search = filters.ingredientSearch.toLowerCase();
              const hasIng = r.ingredients.some(i => i.item_name.toLowerCase().includes(search));
              if (!hasIng) return false;
          }
          
          // Spiciness Filter
          if (filters.onlySpicy) {
              if (!isRecipeSpicy(r)) return false;
          }

          // Rating Filter
          if (filters.minRating > 0) {
              const stats = getRecipeStats(r.id);
              // Use user rating if available, else base rating
              const rating = stats.count > 0 ? stats.average : (r.rating || 0);
              if (rating < filters.minRating) return false;
          }

          // Dietary Filter
          if (filters.dietary.length > 0) {
             const type = getDietaryType(r);
             if (!filters.dietary.includes(type)) return false;
          }

          return true;
      });
  }, [recipes, filters, plan]);

  const activeFilterCount = useMemo(() => {
      let count = 0;
      if (filters.cuisines.length > 0) count++;
      if (filters.ingredientSearch) count++;
      if (filters.onlySpicy) count++;
      if (filters.minRating > 0) count++;
      if (filters.dietary.length > 0) count++;
      return count;
  }, [filters]);

  const clearFilters = () => {
      setFilters({
          cuisines: [],
          ingredientSearch: '',
          onlySpicy: false,
          minRating: 0,
          dietary: []
      });
  };

  const toggleCuisineFilter = (c: string) => {
      setFilters(prev => {
          if (prev.cuisines.includes(c)) {
              return { ...prev, cuisines: prev.cuisines.filter(x => x !== c) };
          } else {
              return { ...prev, cuisines: [...prev.cuisines, c] };
          }
      });
  };

  const toggleDietaryFilter = (d: string) => {
      setFilters(prev => {
          if (prev.dietary.includes(d)) {
              return { ...prev, dietary: prev.dietary.filter(x => x !== d) };
          } else {
              return { ...prev, dietary: [...prev.dietary, d] };
          }
      });
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
  }, [feedbackRecipe, plan]);

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
        const text = await file.text();
        setImportText(text);
        e.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
        const result = event.target?.result as string;
        const base64Data = result.split(',')[1];
        setImportFile({
            data: base64Data,
            mimeType: file.type,
            name: file.name
        });
    };
    reader.readAsDataURL(file);
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
      setSuggestions([]); 

      try {
          const favorites = recipes.filter(r => {
             const stats = getRecipeStats(r.id);
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

  return (
    <div className="pb-24 md:pb-4 space-y-3">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-baseline gap-2">
          <h1 className="text-xl font-bold text-nordic-text">{t.recipes_title}</h1>
          <p className="text-nordic-muted text-xs">{filteredRecipes.length} {t.saved}</p>
        </div>
        <div className="flex gap-2">
            <Button onClick={() => setShowFilters(true)} variant="secondary" className={`!p-2 h-8 aspect-square relative ${activeFilterCount > 0 ? 'text-nordic-primary border-nordic-primary' : ''}`}>
                <Icons.Filter className="w-4 h-4" />
                {activeFilterCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-3 h-3 bg-nordic-accent rounded-full text-[8px] flex items-center justify-center text-white border border-white">
                        {activeFilterCount}
                    </span>
                )}
            </Button>
            <Button onClick={handleSuggestRecipes} variant="secondary" className="!p-2 h-8 aspect-square text-nordic-accent">
                <Icons.Sparkles className="w-4 h-4" />
            </Button>
            <Button onClick={() => setImportOpen(true)} variant="primary" className="!p-2 h-8 aspect-square">
               <Icons.Plus className="w-4 h-4" />
            </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 md:gap-4">
        {filteredRecipes.map(recipe => {
            const stats = getRecipeStats(recipe.id);
            const isSpicy = isRecipeSpicy(recipe);

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
                   <div className="absolute top-2 right-2 flex flex-col gap-1 items-end">
                       {isSpicy && (
                           <span className="text-[10px] bg-red-500/90 text-white px-1.5 py-0.5 rounded font-bold shadow-sm">
                               🌶️
                           </span>
                       )}
                   </div>
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

      {/* --- Filters Modal --- */}
      <Modal isOpen={showFilters} onClose={() => setShowFilters(false)} title={t.filter}>
           <div className="space-y-6">
               {/* Dietary Filter (NEW) */}
               <div>
                   <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">{t.dietary || 'Dietary'}</h3>
                   <div className="flex flex-wrap gap-2">
                       {['Meat', 'Fish', 'Vegetarian'].map(type => (
                           <button
                               key={type}
                               onClick={() => toggleDietaryFilter(type)}
                               className={`px-3 py-1.5 rounded-full text-xs transition-colors border ${filters.dietary.includes(type) ? 'bg-nordic-primary text-white border-nordic-primary' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}
                           >
                               {type === 'Vegetarian' ? (t.vegetarian || type) : type === 'Fish' ? (t.fish || type) : type}
                           </button>
                       ))}
                   </div>
               </div>

               {/* Cuisine Filter */}
               <div>
                   <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">{t.cuisineFilter}</h3>
                   <div className="flex flex-wrap gap-2">
                       {allCuisines.map(c => (
                           <button
                               key={c}
                               onClick={() => toggleCuisineFilter(c)}
                               className={`px-3 py-1.5 rounded-full text-xs transition-colors border ${filters.cuisines.includes(c) ? 'bg-nordic-primary text-white border-nordic-primary' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}
                           >
                               {c}
                           </button>
                       ))}
                   </div>
               </div>

               {/* Ingredients Filter */}
               <div>
                   <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">{t.ingredientsFilter}</h3>
                   <Input 
                        placeholder="e.g. Chicken, Tomato..."
                        value={filters.ingredientSearch}
                        onChange={(e: any) => setFilters({...filters, ingredientSearch: e.target.value})}
                        className="text-sm"
                   />
               </div>

               {/* Spiciness & Rating */}
               <div className="grid grid-cols-2 gap-4">
                   <div>
                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">{t.spiciness}</h3>
                        <label className="flex items-center gap-2 cursor-pointer bg-gray-50 p-2 rounded-xl border border-gray-100">
                             <input 
                                 type="checkbox" 
                                 checked={filters.onlySpicy}
                                 onChange={(e) => setFilters({...filters, onlySpicy: e.target.checked})}
                                 className="w-4 h-4 rounded text-nordic-primary focus:ring-nordic-primary"
                             />
                             <span className="text-sm font-medium">{t.spicyOnly} 🌶️</span>
                        </label>
                   </div>
                   <div>
                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">{t.minRating}</h3>
                        <div className="flex bg-gray-50 p-1.5 rounded-xl border border-gray-100 justify-between">
                            {[1,2,3,4,5].map(star => (
                                <button key={star} onClick={() => setFilters({...filters, minRating: star === filters.minRating ? 0 : star})}>
                                    <Icons.Star 
                                        className={`w-5 h-5 ${star <= filters.minRating ? 'text-nordic-accent' : 'text-gray-300'}`} 
                                        fill={star <= filters.minRating} 
                                    />
                                </button>
                            ))}
                        </div>
                   </div>
               </div>

               <div className="flex gap-2 pt-2 border-t border-gray-100">
                   <Button onClick={() => setShowFilters(false)} className="flex-1">
                       {t.showResults} ({filteredRecipes.length})
                   </Button>
                   <Button variant="secondary" onClick={clearFilters} className="flex-1">
                       {t.clearAll}
                   </Button>
               </div>
           </div>
      </Modal>

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
            placeholder={t.recipe_placeholder}
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