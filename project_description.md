# HomeChef Hub - Project Description

## Overview
**HomeChef Hub** is a self-hosted, privacy-focused Progressive Web App (PWA) designed to streamline family meal planning, shopping, and cooking. It combines a clean, "Nordic-style" aesthetic with powerful AI capabilities to reduce the cognitive load of managing a household kitchen.

The application follows a **Local-First** philosophy, storing all data (recipes, plans, history) in the browser's IndexedDB, ensuring privacy and offline capability. It integrates with Google's Gemini API to provide intelligent features like recipe parsing, image generation, nutrition estimation, and personalized suggestions.

---

## Core Workflow
The app is designed around a cyclical workflow:
1.  **Plan:** Schedule meals for the week using drag-and-drop or AI generation.
2.  **Shop:** Automatically generate a shopping list based on the plan, filtered by store layout.
3.  **Cook:** Use the immersive cooking mode with step-by-step instructions.
4.  **Track:** Rate meals and track history to generate statistics and better recommendations over time.

---

## User Interface & Design
*   **Style:** Minimalist Nordic design using a palette of Teal (`#0f766e`), Slate (`#334155`), and Amber (`#f59e0b`).
*   **Mobile-First:** optimized for touch interactions, including swipe navigation, long-press actions, and bottom navigation bars.
*   **Visuals:** Heavy use of card-based layouts, rounded corners, and smooth transitions.

---

## Detailed Features by View

### 1. Plan View (The Hub)
The central dashboard showing the weekly schedule.
*   **Calendar Interface:** Displays a scrollable list of days (defaulting to the current week).
*   **Meal Cards:** Shows the recipe image, title, and serving size.
    *   **Status Indicators:** Shows if a meal has been cooked or rated.
    *   **Quick Actions:** Move up/down, Refresh (swap recipe), or Remove.
*   **Interactions:**
    *   **Drag & Drop:** Long-press a meal to drag it to a different day.
    *   **Add Meal:** Click empty slots to search and select recipes.
    *   **Undo:** Robust undo functionality for planning mistakes.
    *   **Generation:** "Generate Plan" button to auto-fill empty slots based on recipe rotation.

### 2. Shop View (Smart Shopping List)
An intelligent list that aggregates ingredients from the Meal Plan and merges them with manual items.
*   **Automatic Aggregation:** Ingredients from planned meals (filtered by selected week) are summed up automatically.
*   **Pantry Exclusion:** Items listed in "Pantry Staples" (Settings) are automatically excluded.
*   **Categorization:** Items are grouped by aisle/category (Produce, Dairy, etc.).
    *   **Store Layouts:** Users can define custom category orders for different stores (e.g., "Supermarket A" vs. "Local Grocer").
*   **Interactions:**
    *   **Check/Uncheck:** Tap to toggle state.
    *   **Edit:** Click to modify quantity or unit.
    *   **Move:** Long-press an item to move it to a different category.
    *   **Manual Add:** Add generic items like "Paper towels".

### 3. Recipes View (Digital Cookbook)
A visual grid of all stored recipes.
*   **Recipe Cards:** dynamic cards showing food photography (user-uploaded or AI-generated), ratings, and cuisine tags.
*   **Import Options:**
    *   **AI Import:** Paste text, a URL, or upload an image of a physical cookbook page. Gemini parses this into structured JSON.
*   **AI Suggestions:** A "Sparkles" button analyzes favorite recipes (high rating + frequency) and suggests 5 new dish ideas using AI.
*   **Context Menu:** Long-press a card to Edit, Delete, or View Feedback summaries.

### 4. Recipe Detail (The Cooking Experience)
A modal view when a recipe is selected.
*   **Versioning:** Supports recipe version history. If a recipe is modified, a snapshot is saved, allowing users to view/revert to previous iterations.
*   **Immersive Cooking Mode:** A step-by-step full-screen view with a progress bar and wake-lock (keeps screen on).
*   **AI Features:**
    *   **Improvement:** "AI Improve" suggests changes based on household context (e.g., "Make it kid-friendly").
    *   **Refine:** Rewrite instructions to be more detailed or simplified.
    *   **Nutrition:** Estimate calories and macros based on ingredients.
    *   **Image Gen:** Create professional food photography for the recipe.
*   **Scaling:** Adjust serving sizes dynamically, which recalculates ingredient quantities.

### 5. Stats View (Insights)
Visualizes data derived from the user's meal history (past planned meals).
*   **Highlights:** Displays "Most Frequent Meal", "Best Rated", and "Top Cuisine".
*   **Dietary Breakdown:** A chart showing the distribution of protein sources (Beef, Poultry, Fish, Vegetarian, etc.).
*   **Vegetarian Frequency:** Tracks how often the household eats vegetarian meals.

### 6. Settings View (Configuration)
*   **Household:** Set default adults/kids count for portion scaling.
*   **Stores:** Manage store profiles and drag-and-drop category layouts.
*   **Pantry Staples:** Define keyword list for shopping list exclusion.
*   **Data Management:** Export data to JSON, clear history, or manage the ingredients database (merge duplicates).

---

## AI Capabilities (Gemini Integration)
The app leverages `@google/genai` for specific tasks:
1.  **Parsing:** Converts unstructured text/images into `Recipe` objects.
2.  **Visuals:** Generates `16:9` food photography.
3.  **Nutrition:** Calculates macros (`Nutrition` object) from ingredient lists.
4.  **Ideation:** Suggests new recipes based on user preferences.
5.  **Refinement:** Rewrites instructions for clarity or brevity.
6.  **Contextual Improvement:** Modifies recipes based on specific constraints (e.g., allergies, kids).
7.  **Summarization:** Aggregates user rating comments into concise feedback.

---

## Data Structure
*   **Recipe:** Contains ingredients, instructions, metadata, and a `history` array for version control.
*   **MealPlanItem:** Links a date to a specific `Recipe` ID and `version`. This ensuring that if a recipe changes, past meal records remain accurate to what was actually cooked.
*   **ShoppingItem:** Represents an aggregated ingredient or manual item with checked state.

## Technical Stack
*   **Frontend:** React 19, TypeScript, Tailwind CSS.
*   **State Management:** React Hooks + Local Component State.
*   **Persistence:** Custom `storage.ts` service wrapping IndexedDB.
*   **AI:** Google Gemini API (via `@google/genai` SDK).
