    (() => {
      const dayMs = 24 * 60 * 60 * 1000;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const startDate = new Date(today);
      startDate.setDate(startDate.getDate() - ((startDate.getDay() + 6) % 7));
      const selectedDateDay = document.querySelector("#selected-date-day");
      const selectedDateFull = document.querySelector("#selected-date-full");
      const dayStrip = document.querySelector("#day-strip");
      const mealList = document.querySelector("#meal-list");
      const guestStorageKey = "sprout-planner-guest-v1";
      const starterStorageKey = "sprout-planner-v1";
      const authChoiceKey = "sprout-auth-choice-v1";
      let storageKey = guestStorageKey;
      let calorieGoal = 2000;
      let selectedDate = new Date(today);
      let waterCount = 0;
      let waterLogs = {};
      let profile = null;
      let currentUser = { uid: "guest", displayName: "Guest", isGuest: true };
      let firebaseServices = null;
      let emailAuthMode = "signIn";
      let profileSetupRequired = false;
      let cloudSaveTimeout = null;
      let cloudRevision = 0;
      let cloudSaveChain = Promise.resolve();
      let cloudConflict = false;
      let editingMealId = null;
      let toastTimeout;

      const mealData = {};

      const macroGoals = { Protein: 100, Carbs: 220, Fat: 65 };
      const macroColors = { Protein: "protein", Carbs: "carbs", Fat: "fat" };

      function dateKey(date) {
        return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
      }

      function isValidDateKey(key) {
        if (typeof key !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
        const [year, month, day] = key.split("-").map(Number);
        return dateKey(new Date(year, month - 1, day)) === key;
      }

      function makeId() {
        return `meal-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      }

      function isValidMeal(meal) {
        return meal && typeof meal === "object" &&
          ["Breakfast", "Lunch", "Snack", "Dinner"].includes(meal.type) &&
          typeof meal.name === "string" && meal.name.trim().length > 0 &&
          Number.isInteger(meal.calories) && meal.calories >= 1 && meal.calories <= 5000 &&
          (meal.id === undefined || (typeof meal.id === "string" && meal.id.length > 0)) &&
          (meal.recipeId === undefined || (typeof meal.recipeId === "string" && window.SPROUT_RECIPES.some(recipe => recipe.id === meal.recipeId))) &&
          (meal.allergens === undefined || (Array.isArray(meal.allergens) && meal.allergens.every(allergen => typeof allergen === "string"))) &&
          (meal.detail === undefined || (typeof meal.detail === "string" && meal.detail.length <= 180)) &&
          (meal.time === undefined || typeof meal.time === "string") &&
          (meal.emoji === undefined || typeof meal.emoji === "string") &&
          (["protein", "carbs", "fat"].every(key => meal[key] === undefined) ||
            ["protein", "carbs", "fat"].every(key => Number.isFinite(meal[key]) && meal[key] >= 0 && meal[key] <= 1000));
      }

      function isValidProfile(savedProfile) {
        return savedProfile && typeof savedProfile === "object" &&
          Number.isInteger(savedProfile.age) && savedProfile.age >= 18 && savedProfile.age <= 100 &&
          Number.isFinite(savedProfile.weightKg) && savedProfile.weightKg >= 30 && savedProfile.weightKg <= 300 &&
          Number.isFinite(savedProfile.heightCm) && savedProfile.heightCm >= 120 && savedProfile.heightCm <= 230 &&
          ["lose", "maintain", "gain"].includes(savedProfile.goal) &&
          ["low", "light", "moderate", "high"].includes(savedProfile.activity) &&
          ["balanced", "vegetarian", "vegan"].includes(savedProfile.diet) &&
          isValidTime(savedProfile.breakfastTime) &&
          isValidTime(savedProfile.lunchTime) &&
          isValidTime(savedProfile.dinnerTime) &&
          typeof savedProfile.allergies === "string" && savedProfile.allergies.length <= 180;
      }

      function isValidTime(value) {
        if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) return false;
        const [hours, minutes] = value.split(":").map(Number);
        return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
      }

      function applySavedState(saved) {
          if (!saved || typeof saved !== "object" || Array.isArray(saved)) {
            throw new Error("Saved planner data has an invalid format.");
          }
          let savedDate = null;
          if (saved.meals !== undefined) {
            if (!saved.meals || typeof saved.meals !== "object" || Array.isArray(saved.meals)) {
              throw new Error("Saved meal plans have an invalid format.");
            }
            for (const [key, meals] of Object.entries(saved.meals)) {
              if (!isValidDateKey(key) || !Array.isArray(meals) || !meals.every(isValidMeal)) {
                throw new Error("Saved meal plans contain invalid entries.");
              }
            }
          }
          if (saved.water !== undefined) {
            if (!saved.water || typeof saved.water !== "object" || Array.isArray(saved.water) ||
                Object.entries(saved.water).some(([key, value]) => !isValidDateKey(key) || !Number.isInteger(value) || value < 0 || value > 8)) {
              throw new Error("Saved hydration data has an invalid format.");
            }
          }
          if (saved.goal !== undefined) {
            if (!Number.isInteger(saved.goal) || saved.goal < 500 || saved.goal > 10000) {
              throw new Error("Saved calorie goal is outside the supported range.");
            }
          }
          if (saved.profile !== undefined && saved.profile !== null && !isValidProfile(saved.profile)) {
            throw new Error("Saved profile has an invalid format.");
          }
          if (saved.selectedDate !== undefined) {
            if (!isValidDateKey(saved.selectedDate)) {
              throw new Error("Saved selected date is not a valid calendar date.");
            }
            const [year, month, day] = saved.selectedDate.split("-").map(Number);
            savedDate = new Date(year, month - 1, day);
          }
          if (saved.meals !== undefined) Object.assign(mealData, saved.meals);
          if (saved.water !== undefined) waterLogs = saved.water;
          if (saved.goal !== undefined) calorieGoal = saved.goal;
          if (saved.profile !== undefined) profile = saved.profile;
          if (savedDate) selectedDate = savedDate;
      }

      function loadSavedState() {
        try {
          let raw = localStorage.getItem(storageKey);
          if (!raw && storageKey === guestStorageKey) {
            raw = localStorage.getItem(starterStorageKey);
            if (raw) localStorage.setItem(guestStorageKey, raw);
          }
          if (raw) applySavedState(JSON.parse(raw));
        } catch (error) {
          console.error("Unable to load saved planner data.", error);
          showToast("Saved planner data couldn't be loaded. Your sample plan is still available.");
        }
      }

      function serializeState() {
        return {
          meals: mealData,
          water: waterLogs,
          goal: calorieGoal,
          selectedDate: dateKey(selectedDate),
          profile
        };
      }

      function resetPlannerState() {
        for (const key of Object.keys(mealData)) delete mealData[key];
        waterLogs = {};
        calorieGoal = 2000;
        selectedDate = new Date(today);
        profile = null;
      }

      function saveState() {
        let savedLocally = true;
        try {
          localStorage.setItem(storageKey, JSON.stringify(serializeState()));
        } catch (error) {
          console.error("Unable to save planner data.", error);
          showToast("Changes are visible but couldn't be saved in this browser.");
          savedLocally = false;
        }
        if (firebaseServices && currentUser && !currentUser.isGuest) {
          const userId = currentUser.uid;
          const savedState = serializeState();
          clearTimeout(cloudSaveTimeout);
          cloudSaveTimeout = setTimeout(() => {
            if (currentUser.isGuest || currentUser.uid !== userId) return;
            cloudSaveChain = cloudSaveChain
              .then(() => writeCloudState(userId, savedState))
              .catch(error => {
                console.error("Unable to sync planner data to Firebase.", error);
                if (error.message === "SPROUT_CLOUD_CONFLICT") {
                  setSyncBanner("A newer cloud plan exists. Your local changes are kept on this device; load the latest plan before continuing.", true);
                  showToast("Cloud changes conflict with this device's plan.");
                } else {
                  setSyncBanner("Cloud sync failed. Your changes are saved on this device.", false);
                  showToast("Your changes are saved on this device but couldn't sync to Firebase.");
                }
              });
          }, 350);
        }
        return savedLocally;
      }

      async function writeCloudState(userId, state) {
        if (!firebaseServices || currentUser.isGuest || currentUser.uid !== userId) return;
        const { db, doc, runTransaction, serverTimestamp } = firebaseServices;
        const reference = doc(db, "users", userId, "planner", "default");
        const nextRevision = await runTransaction(db, async transaction => {
          const snapshot = await transaction.get(reference);
          const remoteRevision = snapshot.exists() ? snapshot.data().revision || 0 : 0;
          if (!Number.isInteger(remoteRevision) || remoteRevision !== cloudRevision) {
            throw new Error("SPROUT_CLOUD_CONFLICT");
          }
          transaction.set(reference, {
            ...state,
            revision: remoteRevision + 1,
            updatedAt: serverTimestamp()
          });
          return remoteRevision + 1;
        });
        if (currentUser.isGuest || currentUser.uid !== userId) return;
        cloudRevision = nextRevision;
        cloudConflict = false;
        setSyncBanner("Your plan is synced to your Firebase account.", false);
        setTimeout(() => {
          if (!cloudConflict && !currentUser.isGuest && currentUser.uid === userId) setSyncBanner("", false);
        }, 1800);
      }

      loadSavedState();
      for (const meals of Object.values(mealData)) {
        for (const meal of meals) {
          if (typeof meal.id !== "string" || !meal.id) meal.id = makeId();
        }
      }

      function mealsForSelectedDay() {
        const key = dateKey(selectedDate);
        if (!mealData[key]) mealData[key] = [];
        return mealData[key];
      }

      function estimateCalorieGoal(userProfile) {
        const activityMultipliers = { low: 1.2, light: 1.375, moderate: 1.55, high: 1.725 };
        const estimatedBase = 10 * userProfile.weightKg + 6.25 * userProfile.heightCm - 5 * userProfile.age - 78;
        const maintenance = estimatedBase * activityMultipliers[userProfile.activity];
        const adjustment = { lose: -300, maintain: 0, gain: 200 }[userProfile.goal];
        return Math.min(5000, Math.max(1200, Math.round((maintenance + adjustment) / 50) * 50));
      }

      function timeAfterLunch(profileForTime) {
        const [lunchHour, lunchMinute] = profileForTime.lunchTime.split(":").map(Number);
        const [dinnerHour, dinnerMinute] = profileForTime.dinnerTime.split(":").map(Number);
        const lunch = lunchHour * 60 + lunchMinute;
        const dinner = dinnerHour * 60 + dinnerMinute;
        const midpoint = lunch + ((dinner > lunch ? dinner - lunch : 180) / 2);
        const hour24 = Math.floor(midpoint / 60) % 24;
        const minutes = Math.floor(midpoint % 60);
        return `${String(hour24).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
      }

      const allergyMatchers = [
        { name: "peanuts", pattern: /\b(peanut|peanuts|groundnut|groundnuts)\b/i },
        { name: "tree nuts", pattern: /\b(tree nut|tree nuts|almond|almonds|cashew|cashews|walnut|walnuts|pistachio|pistachios|pecan|pecans|hazelnut|hazelnuts|brazil nut|brazil nuts)\b/i },
        { name: "dairy", pattern: /\b(dairy|milk|lactose|cheese|butter|yogurt|yoghurt|cream)\b/i },
        { name: "egg", pattern: /\b(egg|eggs)\b/i },
        { name: "gluten", pattern: /\b(wheat|gluten|celiac|coeliac)\b/i },
        { name: "soy", pattern: /\b(soy|soya|edamame|tofu)\b/i },
        { name: "fish", pattern: /\b(fish|salmon|tuna|cod|anchovy|anchovies)\b/i },
        { name: "shellfish", pattern: /\b(shellfish|shrimp|prawn|prawns|crab|lobster|crustacean|crustaceans)\b/i },
        { name: "sesame", pattern: /\b(sesame|tahini)\b/i }
      ];
      const ignorableAllergyWords = new Set(["allergy", "allergies", "allergic", "intolerance", "intolerant", "sensitivity", "sensitive", "to", "and", "avoid", "avoidance", "no", "the", "a", "an"]);

      function assessAllergies(userProfile) {
        const notes = userProfile?.allergies?.trim() || "";
        const allergens = new Set();
        const unknown = [];
        for (const entry of notes.split(/[,;\n]+/).map(item => item.trim()).filter(Boolean)) {
          const matcherEntry = entry.replace(/\bpeanut butter\b/gi, "peanut");
          const matches = allergyMatchers.filter(item => item.pattern.test(matcherEntry));
          if (matches.length) {
            matches.forEach(match => allergens.add(match.name));
            continue;
          }
          const residual = entry.toLowerCase()
            .replace(/[^\p{L}\p{N}\s-]/gu, " ")
            .split(/\s+/)
            .filter(word => word && !ignorableAllergyWords.has(word));
          if (residual.length) unknown.push(entry);
        }
        return { allergens, unknown };
      }

      function availableRecipes(userProfile) {
        const assessment = assessAllergies(userProfile);
        if (assessment.unknown.length) return { recipes: [], assessment };
        const diet = userProfile?.diet || "balanced";
        const recipes = window.SPROUT_RECIPES.filter(recipe =>
          recipeMatchesDiet(recipe, diet) && !recipe.allergens.some(allergen => assessment.allergens.has(allergen))
        );
        return { recipes, assessment };
      }

      function recipeMatchesDiet(recipe, diet) {
        if (Array.isArray(recipe.diets)) return recipe.diets.includes(diet);
        if (diet === "balanced") return true;
        if (diet === "vegetarian") return ["vegetarian", "vegan"].includes(recipe.diet);
        return recipe.diet === "vegan";
      }

      function recipeIngredients(recipe) {
        return recipe.detail.split(",").map(ingredient => ingredient.trim()).filter(Boolean);
      }

      function generateWeeklyPlan(userProfile) {
        const result = availableRecipes(userProfile);
        if (result.assessment.unknown.length) {
          return { planned: 0, reason: `We couldn't verify these allergy notes against the recipe library: ${result.assessment.unknown.join(", ")}. No automatic meals were added.` };
        }
        const monday = new Date(selectedDate);
        monday.setDate(selectedDate.getDate() - ((selectedDate.getDay() + 6) % 7));
        const mealTypes = ["Breakfast", "Lunch", "Snack", "Dinner"];
        let planned = 0;
        for (let day = 0; day < 7; day += 1) {
          const date = new Date(monday);
          date.setDate(monday.getDate() + day);
          const times = [userProfile.breakfastTime, userProfile.lunchTime, timeAfterLunch(userProfile), userProfile.dinnerTime];
          mealData[dateKey(date)] = mealTypes.flatMap((type, index) => {
            const candidates = result.recipes.filter(recipe => recipe.type === type);
            if (!candidates.length) return [];
            const recipe = candidates[(day + index) % candidates.length];
            const [hours, minutes] = times[index].split(":").map(Number);
            planned += 1;
            return {
              id: makeId(),
              recipeId: recipe.id,
              type,
              name: recipe.name,
              detail: recipe.detail,
              emoji: recipe.emoji,
              calories: recipe.calories,
              protein: recipe.protein,
              carbs: recipe.carbs,
              fat: recipe.fat,
              allergens: recipe.allergens,
              time: new Date(2000, 0, 1, hours, minutes).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
            };
          });
        }
        if (planned === 0) return { planned, reason: "No recipes in the library meet this diet and allergy combination. No meals were added." };
        return { planned, reason: "" };
      }

      function removeUnsafeRecipeMeals(userProfile) {
        const assessment = assessAllergies(userProfile);
        let removed = 0;
        for (const [key, meals] of Object.entries(mealData)) {
          mealData[key] = meals.filter(meal => {
            if (!meal.recipeId) return true;
            const recipe = window.SPROUT_RECIPES.find(item => item.id === meal.recipeId);
            const safe = !assessment.unknown.length && recipe &&
              recipeMatchesDiet(recipe, userProfile.diet) &&
              !recipe.allergens.some(allergen => assessment.allergens.has(allergen));
            if (!safe) removed += 1;
            return safe;
          });
        }
        return removed;
      }

      function setAccountLabels() {
        const accountName = currentUser.displayName || currentUser.email?.split("@")[0] || (currentUser.isGuest ? "Guest" : "Your account");
        document.querySelector("#account-name").textContent = accountName;
        document.querySelector("#account-plan").textContent = profile
          ? `${profile.diet[0].toUpperCase()}${profile.diet.slice(1)} · ${profile.weightKg} kg`
          : currentUser.isGuest ? "Guest plan" : "Personal plan";
        const accountAction = currentUser.isGuest ? "Sign in or switch account" : "Sign out";
        document.querySelector("#sign-out").setAttribute("aria-label", accountAction);
        document.querySelector("#sign-out").title = accountAction;
      }

      function renderDayStrip() {
        const monday = new Date(selectedDate);
        monday.setDate(selectedDate.getDate() - ((selectedDate.getDay() + 6) % 7));
        dayStrip.replaceChildren();
        for (let index = 0; index < 7; index += 1) {
          const date = new Date(monday.getTime() + index * dayMs);
          const button = document.createElement("button");
          button.type = "button";
          button.className = "day-button";
          if (dateKey(date) === dateKey(selectedDate)) button.classList.add("selected");
          if (dateKey(date) === dateKey(today)) button.classList.add("today");
          button.setAttribute("aria-pressed", String(dateKey(date) === dateKey(selectedDate)));
          button.setAttribute("aria-label", date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }));
          button.innerHTML = `<span class="day-name">${date.toLocaleDateString("en-US", { weekday: "short" })}</span><span class="day-number">${date.getDate()}</span>`;
          button.addEventListener("click", () => {
            selectedDate = date;
            render();
          });
          dayStrip.append(button);
        }
      }

      function renderConsistency() {
        const monday = new Date(selectedDate);
        monday.setDate(selectedDate.getDate() - ((selectedDate.getDay() + 6) % 7));
        const dots = document.querySelector("#week-dots");
        const dayNames = ["M", "T", "W", "T", "F", "S", "S"];
        let plannedDays = 0;
        dots.replaceChildren();
        for (let index = 0; index < 7; index += 1) {
          const date = new Date(monday.getTime() + index * dayMs);
          const hasMeals = (mealData[dateKey(date)] || []).length > 0;
          if (hasMeals) plannedDays += 1;
          const dot = document.createElement("span");
          dot.className = `week-dot${hasMeals ? " done" : ""}`;
          const marker = document.createElement("i");
          const label = document.createElement("span");
          label.textContent = dayNames[index];
          dot.append(marker, label);
          dots.append(dot);
        }
        dots.setAttribute("aria-label", `${plannedDays} of 7 days have meals planned`);
        document.querySelector("#planned-days").textContent = `${plannedDays} day${plannedDays === 1 ? "" : "s"}`;
        document.querySelector("#planned-copy").textContent = plannedDays === 7
          ? "Your week is all planned. Make room for flexibility, too."
          : `Meals planned for ${plannedDays} of 7 days this week.`;
      }

      function renderMeals() {
        const meals = [...mealsForSelectedDay()].sort((first, second) => {
          const order = { Breakfast: 0, Lunch: 1, Snack: 2, Dinner: 3 };
          return order[first.type] - order[second.type];
        });
        mealList.replaceChildren();
        if (meals.length === 0) {
          const empty = document.createElement("div");
          empty.className = "empty-meals";
          empty.textContent = "Nothing planned yet. Add a meal to get started.";
          mealList.append(empty);
          return;
        }
        for (const meal of meals) {
          const item = document.createElement("div");
          item.className = "meal-item";
          item.dataset.type = meal.type;
          const emoji = document.createElement("span");
          emoji.className = "meal-emoji";
          emoji.setAttribute("aria-hidden", "true");
          emoji.textContent = meal.emoji || "🍽️";
          const info = document.createElement("div");
          const type = document.createElement("div");
          type.className = "meal-type";
          type.textContent = meal.type;
          const name = document.createElement("div");
          name.className = "meal-name";
          name.textContent = meal.name;
          const detail = document.createElement("div");
          detail.className = "meal-detail";
          detail.textContent = meal.detail || "A tasty addition to your day";
          if (Number.isFinite(meal.protein) && Number.isFinite(meal.carbs) && Number.isFinite(meal.fat)) {
            const nutritionNote = document.createElement("div");
            nutritionNote.className = "meal-nutrition-note";
            nutritionNote.textContent = `${meal.protein}g protein · ${meal.carbs}g carbs · ${meal.fat}g fat${meal.recipeId ? " · recipe estimate" : " · entered values"}`;
            detail.after(nutritionNote);
          }
          info.append(type, name, detail);
          const nutritionNote = detail.nextElementSibling;
          if (nutritionNote?.classList.contains("meal-nutrition-note")) info.append(nutritionNote);
          const right = document.createElement("div");
          right.className = "meal-right";
          const calories = document.createElement("div");
          calories.className = "meal-calories";
          calories.textContent = `${meal.calories} kcal`;
          const time = document.createElement("div");
          time.className = "meal-time";
          time.textContent = meal.time || "Planned";
          right.append(calories, time);
          const actions = document.createElement("div");
          actions.className = "meal-actions";
          const edit = document.createElement("button");
          edit.type = "button";
          edit.dataset.action = "edit";
          edit.dataset.mealId = meal.id;
          edit.setAttribute("aria-label", `Edit ${meal.name}`);
          edit.title = "Edit meal";
          edit.textContent = "✎";
          const remove = document.createElement("button");
          remove.type = "button";
          remove.className = "remove-meal";
          remove.dataset.action = "remove";
          remove.dataset.mealId = meal.id;
          remove.setAttribute("aria-label", `Remove ${meal.name}`);
          remove.title = "Remove meal";
          remove.textContent = "×";
          actions.append(edit, remove);
          item.append(emoji, info, right, actions);
          mealList.append(item);
        }
      }

      function appendRecipeCard(container, recipe, actionLabel) {
        const card = document.createElement("article");
        card.className = "recipe-card";
        const icon = document.createElement("span");
        icon.className = "recipe-card-icon";
        icon.setAttribute("aria-hidden", "true");
        icon.textContent = recipe.emoji;
        const copy = document.createElement("div");
        copy.className = "recipe-card-copy";
        const title = document.createElement("div");
        title.className = "recipe-card-title";
        title.textContent = recipe.name;
        const detail = document.createElement("div");
        detail.className = "recipe-card-detail";
        detail.textContent = recipe.detail;
        const meta = document.createElement("div");
        meta.className = "recipe-card-meta";
        const cuisine = recipe.cuisine ? `${recipe.cuisine}-inspired · ` : "";
        meta.textContent = `${cuisine}${recipe.type} · ${recipe.calories} kcal per serving · ${recipe.protein}g protein · ${recipe.carbs}g carbs · ${recipe.fat}g fat${recipe.allergens.length ? ` · allergens: ${recipe.allergens.join(", ")}` : ""}`;
        copy.append(title, detail, meta);
        const addButton = document.createElement("button");
        addButton.type = "button";
        addButton.className = "recipe-add-button";
        addButton.dataset.addRecipe = recipe.id;
        addButton.textContent = actionLabel;
        card.append(icon, copy, addButton);
        container.append(card);
      }

      function renderRecipeList() {
        const container = document.querySelector("#recipe-list");
        const safetyNote = document.querySelector("#recipe-safety-note");
        const result = availableRecipes(profile);
        container.replaceChildren();
        safetyNote.textContent = result.assessment.unknown.length
          ? `Cannot verify: ${result.assessment.unknown.join(", ")}. Automatic suggestions are disabled until these notes are changed to supported allergens.`
          : `Filtered for ${profile?.diet || "balanced"} meals${result.assessment.allergens.size ? ` without ${[...result.assessment.allergens].join(", ")}` : ""}. Nutrition and allergen tags are estimates and may be incomplete—not a safety guarantee. Check packaging and cross-contact warnings.`;
        const type = document.querySelector("#recipe-type-filter").value;
        const cuisine = document.querySelector("#recipe-cuisine-filter").value;
        const recipes = result.recipes.filter(recipe =>
          (type === "all" || recipe.type === type) &&
          (cuisine === "all" || recipe.cuisine === cuisine)
        );
        if (!recipes.length) {
          const empty = document.createElement("p");
          empty.className = "recipe-empty";
          empty.textContent = result.assessment.unknown.length
            ? "No recipes are shown because at least one allergy note could not be verified. Add a manually reviewed meal or update the allergy note."
            : "No recipes match this diet, allergy, and meal filter. Nothing unsafe was substituted.";
          container.append(empty);
          return;
        }
        for (const recipe of recipes) appendRecipeCard(container, recipe, "＋ Add");
      }

      function addRecipeToSelectedDay(recipeId) {
        const recipe = window.SPROUT_RECIPES.find(item => item.id === recipeId);
        if (!recipe) {
          showToast("That recipe is unavailable. Refresh the page and try again.");
          return;
        }
        const result = availableRecipes(profile);
        if (!result.recipes.some(item => item.id === recipe.id)) {
          showToast("That recipe doesn't match your current diet or allergy filters.");
          renderRecipeList();
          return;
        }
        mealsForSelectedDay().push({
          id: makeId(),
          recipeId: recipe.id,
          type: recipe.type,
          name: recipe.name,
          detail: recipe.detail,
          emoji: recipe.emoji,
          calories: recipe.calories,
          protein: recipe.protein,
          carbs: recipe.carbs,
          fat: recipe.fat,
          allergens: [...recipe.allergens],
          time: "Planned"
        });
        saveState();
        render();
        showToast("Recipe added for one serving");
      }

      function renderSearchResults(query) {
        const results = document.querySelector("#search-results");
        results.replaceChildren();
        const normalizedQuery = query.trim().toLocaleLowerCase();
        if (!normalizedQuery) return;
        const { recipes } = availableRecipes(profile);
        const recipeMatches = recipes.filter(recipe =>
          `${recipe.name} ${recipe.detail} ${recipe.type} ${recipe.cuisine || ""} ${recipe.allergens.join(" ")}`.toLocaleLowerCase().includes(normalizedQuery)
        );
        for (const recipe of recipeMatches.slice(0, 8)) appendRecipeCard(results, recipe, "＋ Add");

        const monday = new Date(selectedDate);
        monday.setDate(selectedDate.getDate() - ((selectedDate.getDay() + 6) % 7));
        for (let index = 0; index < 7; index += 1) {
          const date = new Date(monday);
          date.setDate(monday.getDate() + index);
          const key = dateKey(date);
          const matchingMeals = (mealData[key] || []).filter(meal =>
            `${meal.name} ${meal.detail} ${meal.type}`.toLocaleLowerCase().includes(normalizedQuery)
          );
          for (const meal of matchingMeals) {
            const item = document.createElement("article");
            item.className = "search-result";
            const copy = document.createElement("div");
            copy.className = "search-result-copy";
            const title = document.createElement("div");
            title.className = "search-result-title";
            title.textContent = meal.name;
            const detail = document.createElement("div");
            detail.className = "search-result-detail";
            detail.textContent = `${meal.type} · ${date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · ${meal.calories} kcal`;
            copy.append(title, detail);
            const openButton = document.createElement("button");
            openButton.type = "button";
            openButton.className = "search-result-action";
            openButton.dataset.openDate = key;
            openButton.textContent = "Open day";
            item.append(copy, openButton);
            results.append(item);
          }
        }
        if (!results.childElementCount) {
          const empty = document.createElement("p");
          empty.className = "recipe-empty";
          empty.textContent = "No matching recipes or meals found.";
          results.append(empty);
        }
      }

      function renderShoppingList() {
        const list = document.querySelector("#shopping-list");
        list.replaceChildren();
        const monday = new Date(selectedDate);
        monday.setDate(selectedDate.getDate() - ((selectedDate.getDay() + 6) % 7));
        const items = new Map();
        for (let index = 0; index < 7; index += 1) {
          const date = new Date(monday);
          date.setDate(monday.getDate() + index);
          for (const meal of mealData[dateKey(date)] || []) {
            for (const ingredient of (meal.detail || "").split(",").map(value => value.trim()).filter(Boolean)) {
              const normalized = ingredient.toLocaleLowerCase();
              if (!items.has(normalized)) items.set(normalized, ingredient);
            }
          }
        }
        if (!items.size) {
          const empty = document.createElement("p");
          empty.className = "recipe-empty";
          empty.textContent = "No ingredient notes are in this week's meals yet.";
          list.append(empty);
          return;
        }
        const note = document.createElement("p");
        note.className = "macro-note";
        note.textContent = "Ingredient notes only—quantities are not calculated. Check labels for allergens.";
        list.append(note);
        for (const ingredient of items.values()) {
          const label = document.createElement("label");
          label.className = "shopping-item";
          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          const text = document.createElement("span");
          text.textContent = ingredient;
          label.append(checkbox, text);
          list.append(label);
        }
      }

      function renderNutrition() {
        const meals = mealsForSelectedDay();
        const calories = meals.reduce((sum, meal) => sum + meal.calories, 0);
        const percent = Math.min(100, Math.round(calories / calorieGoal * 100));
        document.querySelector("#calories-consumed").textContent = calories.toLocaleString();
        document.querySelector("#calorie-goal").textContent = calorieGoal.toLocaleString();
        document.querySelector("#calorie-percent").textContent = `${percent}%`;
        const ring = document.querySelector("#calorie-ring");
        ring.style.setProperty("--progress", `${percent * 3.6}deg`);
        ring.setAttribute("aria-label", `${percent} percent of calorie goal`);
        document.querySelector(".calorie-copy .eyebrow").textContent = `${selectedDate.toLocaleDateString("en-US", { weekday: "long" })}'s overview`;
        const loggedMeals = meals.filter(meal =>
          Number.isFinite(meal.protein) && Number.isFinite(meal.carbs) && Number.isFinite(meal.fat)
        );
        const totals = {
          Protein: Math.round(loggedMeals.reduce((sum, meal) => sum + meal.protein, 0)),
          Carbs: Math.round(loggedMeals.reduce((sum, meal) => sum + meal.carbs, 0)),
          Fat: Math.round(loggedMeals.reduce((sum, meal) => sum + meal.fat, 0))
        };
        document.querySelector("#macro-note").textContent = meals.length
          ? `Macro values recorded for ${loggedMeals.length} of ${meals.length} meals. Recipe numbers are serving estimates; manual entries need values from a label or recipe.`
          : "Add a recipe or enter nutrition values from a label to track macros.";
        const macroList = document.querySelector("#macro-list");
        macroList.replaceChildren();
        for (const [name, goal] of Object.entries(macroGoals)) {
          const value = totals[name];
          const row = document.createElement("div");
          const head = document.createElement("div");
          head.className = "macro-head";
          const label = document.createElement("span");
          label.textContent = name;
          const amount = document.createElement("span");
          amount.textContent = loggedMeals.length
            ? `${value}g tracked / ${goal}g`
            : `— / ${goal}g`;
          const track = document.createElement("div");
          track.className = `track ${macroColors[name]}`;
          track.setAttribute("role", "progressbar");
          track.setAttribute("aria-label", `${name} daily goal`);
          track.setAttribute("aria-valuemin", "0");
          track.setAttribute("aria-valuemax", String(goal));
          track.setAttribute("aria-valuenow", String(Math.min(goal, value)));
          if (!loggedMeals.length) track.setAttribute("aria-valuetext", "No macro values recorded");
          const fill = document.createElement("span");
          fill.style.width = `${Math.min(100, value / goal * 100)}%`;
          track.append(fill);
          head.append(label, amount);
          row.append(head, track);
          macroList.append(row);
        }
      }

      function renderWater() {
        document.querySelector("#water-count").textContent = waterCount;
        document.querySelector("#water-message").textContent = waterCount >= 8
          ? "Daily hydration goal reached!"
          : `${8 - waterCount} glass${8 - waterCount === 1 ? "" : "es"} to your daily goal`;
        document.querySelector("#add-water").disabled = waterCount >= 8;
        document.querySelector("#remove-water").disabled = waterCount <= 0;
        const glasses = document.querySelector("#water-glasses");
        glasses.replaceChildren();
        glasses.setAttribute("aria-label", `${waterCount} of 8 glasses`);
        for (let index = 0; index < 8; index += 1) {
          const glass = document.createElement("span");
          glass.textContent = "●";
          if (index < waterCount) glass.classList.add("filled");
          glasses.append(glass);
        }
      }

      function render() {
        const weekday = selectedDate.toLocaleDateString("en-US", { weekday: "long" });
        selectedDateDay.textContent = weekday;
        selectedDateFull.textContent = selectedDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
        document.querySelector("#meals-heading").textContent = `${weekday}'s meals`;
        document.querySelector("#nutrition-heading").textContent = `${weekday}'s nutrition`;
        const allergyWarning = document.querySelector("#allergy-warning");
        allergyWarning.hidden = !profile || !profile.allergies;
        if (profile?.allergies) {
          const assessment = assessAllergies(profile);
          const hasManualMeals = Object.values(mealData).some(meals => meals.some(meal => !meal.recipeId));
          allergyWarning.textContent = assessment.unknown.length
            ? `We couldn't verify these allergy notes against the recipe library: ${assessment.unknown.join(", ")}. Automatic recipe suggestions are disabled. Review manual meals and all labels yourself.`
            : `Recipe suggestions exclude ${[...assessment.allergens].join(", ") || "no recognized allergens"}. Recipe allergen tags may be incomplete and are not a safety guarantee; they do not screen for cross-contact${hasManualMeals ? "; manually entered meals are not screened" : ""}. Always check every ingredient and label.`;
        } else {
          allergyWarning.textContent = "";
        }
        setAccountLabels();
        waterCount = waterLogs[dateKey(selectedDate)] ?? 0;
        renderDayStrip();
        renderConsistency();
        renderMeals();
        renderNutrition();
        renderWater();
      }

      function showToast(message) {
        const toast = document.querySelector("#toast");
        toast.textContent = message;
        toast.classList.add("visible");
        clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => toast.classList.remove("visible"), 2600);
      }

      function setSyncBanner(message, isConflict) {
        const banner = document.querySelector("#sync-banner");
        cloudConflict = isConflict;
        banner.classList.toggle("visible", Boolean(message));
        document.querySelector("#sync-message").textContent = message;
        document.querySelector("#sync-reload").hidden = !isConflict;
      }

      function getAuthChoice() {
        try {
          return localStorage.getItem(authChoiceKey);
        } catch (error) {
          console.error("Unable to read the saved sign-in choice.", error);
          return null;
        }
      }

      function setAuthChoice(choice) {
        try {
          if (choice) localStorage.setItem(authChoiceKey, choice);
          else localStorage.removeItem(authChoiceKey);
        } catch (error) {
          console.error("Unable to save the sign-in choice.", error);
          showToast("Your sign-in preference couldn't be saved in this browser.");
        }
      }

      const authDialog = document.querySelector("#auth-dialog");
      const authStatus = document.querySelector("#auth-status");
      const profileDialog = document.querySelector("#profile-dialog");
      const profileForm = document.querySelector("#profile-form");

      function setAuthStatus(message) {
        authStatus.textContent = message;
      }

      function setAccountAuthAvailability(available, message) {
        document.querySelector("#provider-actions").hidden = !available;
        document.querySelector("#auth-divider").hidden = !available;
        document.querySelector("#email-auth-form").hidden = !available;
        document.querySelector("#auth-mode-switch").hidden = !available;
        document.querySelector("#password-reset").hidden = !available;
        document.querySelector("#auth-copy").textContent = available
          ? "Sign in to keep your personal plan with you, or try the planner as a guest."
          : "Account sign-in isn't configured on this site yet. You can still use the planner as a guest.";
        setAuthStatus(message);
      }

      function openProfileDialog(isRequired) {
        profileSetupRequired = isRequired;
        profileForm.reset();
        if (profile) {
          for (const [field, value] of Object.entries(profile)) {
            if (profileForm.elements[field]) profileForm.elements[field].value = value;
          }
        }
        document.querySelector("#profile-title").textContent = isRequired ? "Build your personal plan" : "Your profile & plan";
        document.querySelector("#profile-subtitle").textContent = isRequired
          ? "A few details help tailor your meal plan to your routine."
          : "Update your details and choose whether to replace this week's meals.";
        document.querySelector("#save-profile").textContent = isRequired ? "Create my plan" : "Save profile";
        document.querySelector("#replace-plan-option").hidden = isRequired;
        document.querySelector("#cancel-profile-dialog").hidden = isRequired;
        document.querySelector("#close-profile-dialog").hidden = isRequired;
        document.querySelector("#skip-profile").hidden = !isRequired;
        document.querySelector("#profile-account-action").hidden = isRequired;
        document.querySelector("#profile-account-action").textContent = currentUser.isGuest ? "Sign in / switch account" : "Sign out";
        profileDialog.showModal();
      }

      function resetToGuest() {
        clearTimeout(cloudSaveTimeout);
        cloudRevision = 0;
        cloudConflict = false;
        setSyncBanner("", false);
        currentUser = { uid: "guest", displayName: "Guest", isGuest: true };
        storageKey = guestStorageKey;
        resetPlannerState();
        loadSavedState();
        for (const meals of Object.values(mealData)) {
          for (const meal of meals) {
            if (typeof meal.id !== "string" || !meal.id) meal.id = makeId();
          }
        }
        render();
      }

      async function continueAsGuest() {
        const firebaseUser = firebaseServices?.auth.currentUser;
        const previousChoice = getAuthChoice();
        setAuthChoice("guest");
        if (firebaseUser) {
          try {
            await firebaseServices.signOut(firebaseServices.auth);
          } catch (error) {
            console.error("Unable to switch from Firebase to guest mode.", error);
            setAuthChoice(previousChoice);
            setAuthStatus(`Couldn't switch to guest mode: ${friendlyAuthError(error)}`);
            return;
          }
        }
        if (!currentUser.isGuest || firebaseUser) resetToGuest();
        else storageKey = guestStorageKey;
        authDialog.close();
        setAuthStatus("");
        render();
        if (!profile) openProfileDialog(true);
      }

      function friendlyAuthError(error) {
        const messages = {
          "auth/operation-not-allowed": "This sign-in method is disabled in Firebase Authentication settings.",
          "auth/unauthorized-domain": "Add this website's host to Firebase Authentication's authorized domains.",
          "auth/popup-blocked": "Your browser blocked the sign-in popup. Allow popups and try again.",
          "auth/popup-closed-by-user": "The sign-in window was closed before the process finished.",
          "auth/account-exists-with-different-credential": "An account with this email already exists using another sign-in method.",
          "auth/email-already-in-use": "An account already uses this email. Try signing in instead.",
          "auth/invalid-credential": "That email or password wasn't recognized.",
          "auth/invalid-email": "Enter a valid email address.",
          "auth/weak-password": "Choose a stronger password with at least 6 characters.",
          "auth/network-request-failed": "Firebase couldn't connect. Check your internet connection and try again."
        };
        return messages[error.code] || error.message || "Sign-in failed. Check your Firebase settings and try again.";
      }

      async function initializeFirebase() {
        if (firebaseServices) return firebaseServices;
        if (location.protocol === "file:") {
          setAccountAuthAvailability(false, "Google, Facebook, and email sign-in require serving this page from localhost or a hosted domain.");
          if (getAuthChoice() !== "guest") authDialog.showModal();
          return null;
        }
        try {
          const { firebaseConfig } = await import("./firebase-config.js");
          if (!firebaseConfig.apiKey || !firebaseConfig.authDomain || !firebaseConfig.projectId || !firebaseConfig.appId) {
            setAccountAuthAvailability(false, "Firebase isn't configured yet. Add your Firebase web app values to firebase-config.js to enable account sign-in.");
            if (getAuthChoice() !== "guest") authDialog.showModal();
            return null;
          }
          const version = "11.10.0";
          const appSdk = await import(`https://www.gstatic.com/firebasejs/${version}/firebase-app.js`);
          const authSdk = await import(`https://www.gstatic.com/firebasejs/${version}/firebase-auth.js`);
          const firestoreSdk = await import(`https://www.gstatic.com/firebasejs/${version}/firebase-firestore.js`);
          const app = appSdk.initializeApp(firebaseConfig);
          const auth = authSdk.getAuth(app);
          const db = firestoreSdk.getFirestore(app);
          firebaseServices = { ...authSdk, ...firestoreSdk, auth, db };
          setAccountAuthAvailability(true, "");
          authSdk.onAuthStateChanged(auth, async user => {
            if (user) {
              try {
                await openFirebaseAccount(user);
              } catch (error) {
                console.error("Unable to load the Firebase account plan.", error);
                setAuthStatus(`Signed in, but the plan couldn't be loaded: ${friendlyAuthError(error)} Check Firestore setup and rules.`);
              }
              return;
            }
            if (!currentUser.isGuest) {
              resetToGuest();
              setAuthStatus("You've signed out.");
            }
            if (getAuthChoice() !== "guest") authDialog.showModal();
          });
          return firebaseServices;
        } catch (error) {
          console.error("Unable to initialize Firebase.", error);
          setAccountAuthAvailability(false, "Firebase couldn't start. Check your project config and network, or continue as a guest.");
          if (getAuthChoice() !== "guest") authDialog.showModal();
          return null;
        }
      }

      async function openFirebaseAccount(user) {
        if (!firebaseServices || (currentUser.uid === user.uid && !currentUser.isGuest)) return;
        clearTimeout(cloudSaveTimeout);
        cloudRevision = 0;
        cloudConflict = false;
        setSyncBanner("", false);
        resetPlannerState();
        currentUser = { uid: user.uid, displayName: user.displayName || "", email: user.email || "", isGuest: false };
        storageKey = `sprout-planner-user-${user.uid}`;
        const { db, doc, getDoc } = firebaseServices;
        const accountDoc = await getDoc(doc(db, "users", user.uid, "planner", "default"));
        if (accountDoc.exists()) {
          const saved = accountDoc.data();
          cloudRevision = saved.revision || 0;
          if (!Number.isInteger(cloudRevision) || cloudRevision < 0) {
            throw new Error("This cloud plan has an invalid revision value.");
          }
          applySavedState(saved);
        }
        setAuthChoice("account");
        authDialog.close();
        setAuthStatus("");
        render();
        if (!profile) openProfileDialog(true);
      }

      async function authenticateWithProvider(providerName) {
        const services = await initializeFirebase();
        if (!services) return;
        try {
          const provider = providerName === "google"
            ? new services.GoogleAuthProvider()
            : new services.FacebookAuthProvider();
          await services.signInWithPopup(services.auth, provider);
        } catch (error) {
          console.error(`${providerName} sign-in failed.`, error);
          setAuthStatus(friendlyAuthError(error));
        }
      }

      document.querySelectorAll("[data-provider]").forEach(button => {
        button.addEventListener("click", () => authenticateWithProvider(button.dataset.provider));
      });

      document.querySelector("#auth-mode-switch").addEventListener("click", event => {
        emailAuthMode = emailAuthMode === "signIn" ? "signUp" : "signIn";
        const isSignUp = emailAuthMode === "signUp";
        document.querySelector("#display-name-field").hidden = !isSignUp;
        document.querySelector("#auth-display-name").required = isSignUp;
        document.querySelector("#auth-password").autocomplete = isSignUp ? "new-password" : "current-password";
        document.querySelector("#email-auth-submit").textContent = isSignUp ? "Create account with email" : "Sign in with email";
        event.currentTarget.textContent = isSignUp ? "Already have an account? Sign in" : "New to Sprout? Create an account";
        setAuthStatus("");
      });

      document.querySelector("#email-auth-form").addEventListener("submit", async event => {
        event.preventDefault();
        const services = await initializeFirebase();
        if (!services) return;
        const formData = new FormData(event.currentTarget);
        const email = formData.get("email").trim();
        const password = formData.get("password");
        try {
          if (emailAuthMode === "signUp") {
            const credential = await services.createUserWithEmailAndPassword(services.auth, email, password);
            const displayName = formData.get("displayName").trim();
            if (displayName) {
              await services.updateProfile(credential.user, { displayName });
              currentUser.displayName = displayName;
              setAccountLabels();
            }
          } else {
            await services.signInWithEmailAndPassword(services.auth, email, password);
          }
        } catch (error) {
          console.error("Email sign-in failed.", error);
          setAuthStatus(friendlyAuthError(error));
        }
      });

      document.querySelector("#password-reset").addEventListener("click", async () => {
        const email = document.querySelector("#auth-email").value.trim();
        if (!email) {
          setAuthStatus("Enter your email address above, then choose password reset.");
          document.querySelector("#auth-email").focus();
          return;
        }
        const services = await initializeFirebase();
        if (!services) return;
        try {
          await services.sendPasswordResetEmail(services.auth, email);
          setAuthStatus("If an account exists for that address, Firebase will send password-reset instructions.");
        } catch (error) {
          console.error("Unable to send a password reset email.", error);
          setAuthStatus(friendlyAuthError(error));
        }
      });

      document.querySelector("#continue-guest").addEventListener("click", continueAsGuest);
      document.querySelector("#auth-dialog").addEventListener("cancel", event => event.preventDefault());
      document.querySelector("#edit-profile").addEventListener("click", () => openProfileDialog(!profile));
      document.querySelector("#close-profile-dialog").addEventListener("click", () => profileDialog.close());
      document.querySelector("#cancel-profile-dialog").addEventListener("click", () => profileDialog.close());
      document.querySelector("#skip-profile").addEventListener("click", () => {
        profileSetupRequired = false;
        profileDialog.close();
        saveState();
        render();
        showToast("You can add your body and routine details any time.");
      });
      profileDialog.addEventListener("cancel", event => {
        if (profileSetupRequired) event.preventDefault();
      });

      profileForm.addEventListener("submit", event => {
        event.preventDefault();
        const formData = new FormData(profileForm);
        const nextProfile = {
          age: Number(formData.get("age")),
          weightKg: Number(formData.get("weightKg")),
          heightCm: Number(formData.get("heightCm")),
          goal: formData.get("goal"),
          activity: formData.get("activity"),
          diet: formData.get("diet"),
          breakfastTime: formData.get("breakfastTime"),
          lunchTime: formData.get("lunchTime"),
          dinnerTime: formData.get("dinnerTime"),
          allergies: formData.get("allergies").trim()
        };
        if (!isValidProfile(nextProfile)) {
          showToast("Check the profile details and try again.");
          return;
        }
        const previousProfile = profile;
        const shouldGenerate = profileSetupRequired || formData.get("replacePlan") === "on";
        if (shouldGenerate && !profileSetupRequired && !window.confirm("Replace this week's planned meals with a new generated plan?")) return;
        profile = nextProfile;
        const targetInputsChanged = !previousProfile ||
          ["age", "weightKg", "heightCm", "activity", "goal"].some(key => previousProfile[key] !== nextProfile[key]);
        if (profileSetupRequired || targetInputsChanged) {
          calorieGoal = estimateCalorieGoal(profile);
        }
        const allergensOrDietChanged = previousProfile &&
          (previousProfile.diet !== nextProfile.diet || previousProfile.allergies !== nextProfile.allergies);
        if (allergensOrDietChanged) removeUnsafeRecipeMeals(profile);
        const planResult = shouldGenerate ? generateWeeklyPlan(profile) : null;
        profileSetupRequired = false;
        profileDialog.close();
        saveState();
        render();
        if (shouldGenerate) {
          showToast(planResult.reason || `Your plan has ${planResult.planned} allergy-filtered recipe meals.`);
        } else if (allergensOrDietChanged) {
          showToast("Profile saved. Unsafe or mismatched generated recipes were removed; review manual meals.");
        } else {
          showToast("Profile saved");
        }
      });

      async function signOutOrSwitchAccount() {
        if (currentUser.isGuest) {
          saveState();
          if (profileDialog.open) profileDialog.close();
          authDialog.showModal();
          setAuthStatus("Your guest plan is saved in this browser.");
          return;
        }
        if (!firebaseServices) {
          showToast("Firebase isn't connected, so this account can't be signed out here.");
          return;
        }
        const previousChoice = getAuthChoice();
        setAuthChoice(null);
        try {
          await firebaseServices.signOut(firebaseServices.auth);
        } catch (error) {
          setAuthChoice(previousChoice);
          console.error("Unable to sign out of Firebase.", error);
          showToast(`Sign-out failed: ${friendlyAuthError(error)}`);
        }
      }

      document.querySelector("#sign-out").addEventListener("click", signOutOrSwitchAccount);
      document.querySelector("#profile-account-action").addEventListener("click", signOutOrSwitchAccount);

      const dialog = document.querySelector("#meal-dialog");
      const mealForm = document.querySelector("#meal-form");

      function openMealDialog(meal) {
        editingMealId = meal ? meal.id : null;
        mealForm.reset();
        document.querySelector("#dialog-title").textContent = meal ? "Edit meal" : "Add a meal";
        document.querySelector("#meal-form").querySelector(".dialog-heading p").textContent = meal
          ? "Make a change to your meal plan."
          : "Make today a little more delicious.";
        document.querySelector("#meal-form").querySelector(".primary").textContent = meal ? "Save changes" : "Add to my day";
        if (meal) {
          mealForm.elements.type.value = meal.type;
          mealForm.elements.name.value = meal.name;
          mealForm.elements.calories.value = meal.calories;
          mealForm.elements.detail.value = meal.detail || "";
          for (const macro of ["protein", "carbs", "fat"]) {
            mealForm.elements[macro].value = Number.isFinite(meal[macro]) ? meal[macro] : "";
          }
        }
        dialog.showModal();
      }

      document.querySelector("#add-meal").addEventListener("click", () => openMealDialog(null));
      document.querySelector("#close-dialog").addEventListener("click", () => dialog.close());
      document.querySelector("#cancel-dialog").addEventListener("click", () => dialog.close());
      mealList.addEventListener("click", event => {
        const actionButton = event.target.closest("button[data-action]");
        if (!actionButton) return;
        const meals = mealsForSelectedDay();
        const mealIndex = meals.findIndex(meal => meal.id === actionButton.dataset.mealId);
        if (mealIndex < 0) {
          showToast("That meal is no longer in this day’s plan.");
          render();
          return;
        }
        if (actionButton.dataset.action === "edit") {
          openMealDialog(meals[mealIndex]);
          return;
        }
        if (actionButton.dataset.action === "remove" &&
            window.confirm(`Remove “${meals[mealIndex].name}” from this day's plan?`)) {
          meals.splice(mealIndex, 1);
          saveState();
          render();
          showToast("Meal removed from your plan");
        }
      });
      mealForm.addEventListener("submit", event => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const macroValues = ["protein", "carbs", "fat"].map(key => formData.get(key));
        const hasAnyMacro = macroValues.some(value => value !== "");
        const hasEveryMacro = macroValues.every(value => value !== "");
        if (hasAnyMacro && !hasEveryMacro) {
          showToast("Enter all three macro values, or leave all three blank.");
          return;
        }
        const meals = mealsForSelectedDay();
        const existingIndex = meals.findIndex(item => item.id === editingMealId);
        const existingMeal = existingIndex >= 0 ? meals[existingIndex] : null;
        const recipeUnchanged = existingMeal?.recipeId &&
          existingMeal.type === formData.get("type") &&
          existingMeal.name === formData.get("name").trim() &&
          existingMeal.calories === Number(formData.get("calories")) &&
          existingMeal.detail === formData.get("detail").trim();
        const meal = {
          id: editingMealId || makeId(),
          type: formData.get("type"),
          name: formData.get("name").trim(),
          calories: Number(formData.get("calories")),
          detail: formData.get("detail").trim(),
          time: editingMealId
            ? existingMeal?.time || "Planned"
            : "Just added",
          emoji: ({ Breakfast: "🥣", Lunch: "🥗", Snack: "🍎", Dinner: "🍽️" })[formData.get("type")],
          ...(recipeUnchanged
            ? { recipeId: existingMeal.recipeId, allergens: [...(existingMeal.allergens || [])] }
            : {}),
          ...(hasEveryMacro
            ? { protein: Number(macroValues[0]), carbs: Number(macroValues[1]), fat: Number(macroValues[2]) }
            : recipeUnchanged
              ? { protein: existingMeal.protein, carbs: existingMeal.carbs, fat: existingMeal.fat }
              : {})
        };
        if (existingIndex >= 0) meals[existingIndex] = meal;
        else meals.push(meal);
        const wasEditing = Boolean(editingMealId);
        editingMealId = null;
        event.currentTarget.reset();
        dialog.close();
        saveState();
        render();
        showToast(wasEditing ? "Meal updated" : "Meal added to your plan");
      });
      dialog.addEventListener("click", event => {
        if (event.target === dialog) dialog.close();
      });
      document.querySelector("#previous-day").addEventListener("click", () => {
        selectedDate = new Date(selectedDate.getTime() - dayMs);
        render();
        saveState();
      });
      document.querySelector("#next-day").addEventListener("click", () => {
        selectedDate = new Date(selectedDate.getTime() + dayMs);
        render();
        saveState();
      });
      document.querySelector("#today-button").addEventListener("click", () => {
        selectedDate = new Date(today);
        render();
        saveState();
      });
      document.querySelector("#add-water").addEventListener("click", () => {
        if (waterCount >= 8) {
          showToast("You've reached your water goal for today!");
          return;
        }
        waterCount += 1;
        waterLogs[dateKey(selectedDate)] = waterCount;
        renderWater();
        saveState();
        showToast("One glass closer to your hydration goal");
      });
      document.querySelector("#remove-water").addEventListener("click", () => {
        if (waterCount <= 0) return;
        waterCount -= 1;
        waterLogs[dateKey(selectedDate)] = waterCount;
        renderWater();
        saveState();
        showToast("Water log updated");
      });
      dayStrip.addEventListener("click", () => saveState());

      const goalDialog = document.querySelector("#goal-dialog");
      const goalForm = document.querySelector("#goal-form");
      document.querySelector("#edit-goal").addEventListener("click", () => {
        goalForm.elements.goal.value = calorieGoal;
        goalDialog.showModal();
      });
      document.querySelector("#close-goal-dialog").addEventListener("click", () => goalDialog.close());
      document.querySelector("#cancel-goal-dialog").addEventListener("click", () => goalDialog.close());
      goalForm.addEventListener("submit", event => {
        event.preventDefault();
        calorieGoal = Number(new FormData(goalForm).get("goal"));
        goalDialog.close();
        saveState();
        renderNutrition();
        showToast("Daily calorie goal updated");
      });
      goalDialog.addEventListener("click", event => {
        if (event.target === goalDialog) goalDialog.close();
      });
      const recipesDialog = document.querySelector("#recipes-dialog");
      const searchDialog = document.querySelector("#search-dialog");
      const shoppingDialog = document.querySelector("#shopping-dialog");
      const recipeList = document.querySelector("#recipe-list");
      const searchResults = document.querySelector("#search-results");
      const cuisineFilter = document.querySelector("#recipe-cuisine-filter");

      for (const cuisine of [...new Set(window.SPROUT_RECIPES.map(recipe => recipe.cuisine).filter(Boolean))].sort()) {
        const option = document.createElement("option");
        option.value = cuisine;
        option.textContent = cuisine;
        cuisineFilter.append(option);
      }

      function openShoppingList() {
        renderShoppingList();
        shoppingDialog.showModal();
      }

      document.querySelector("#sync-reload").addEventListener("click", async () => {
        if (!cloudConflict || currentUser.isGuest || !firebaseServices) return;
        if (!window.confirm("Load the latest cloud plan? This replaces this device's current planner view. A local backup will be kept.")) return;
        try {
          const { db, doc, getDoc } = firebaseServices;
          const snapshot = await getDoc(doc(db, "users", currentUser.uid, "planner", "default"));
          if (!snapshot.exists()) throw new Error("The latest cloud plan no longer exists.");
          const latest = snapshot.data();
          const revision = latest.revision || 0;
          if (!Number.isInteger(revision) || revision < 0) throw new Error("The latest cloud plan has an invalid revision.");
          localStorage.setItem(`${storageKey}-conflict-backup`, JSON.stringify(serializeState()));
          resetPlannerState();
          applySavedState(latest);
          cloudRevision = revision;
          localStorage.setItem(storageKey, JSON.stringify(serializeState()));
          setSyncBanner("", false);
          render();
          showToast("Latest cloud plan loaded. Your previous local draft is backed up on this device.");
        } catch (error) {
          console.error("Unable to load the latest cloud plan.", error);
          showToast(`Couldn't load the latest plan: ${friendlyAuthError(error)}`);
        }
      });

      document.querySelector("#close-recipes-dialog").addEventListener("click", () => recipesDialog.close());
      document.querySelector("#close-search-dialog").addEventListener("click", () => searchDialog.close());
      document.querySelector("#close-shopping-dialog").addEventListener("click", () => shoppingDialog.close());
      document.querySelector("#shopping-open").addEventListener("click", openShoppingList);
      document.querySelector("#personalize-plan").addEventListener("click", () => {
        openProfileDialog(!profile);
        profileDialog.querySelector("#profile-age").focus();
      });
      document.querySelector("#recipe-type-filter").addEventListener("change", renderRecipeList);
      cuisineFilter.addEventListener("change", renderRecipeList);
      document.querySelector("#search-open").addEventListener("click", () => {
        searchDialog.showModal();
        renderSearchResults("");
        document.querySelector("#planner-search").focus();
      });
      document.querySelector("#planner-search").addEventListener("input", event => renderSearchResults(event.currentTarget.value));
      document.querySelector("#open-shopping-list").addEventListener("click", () => {
        recipesDialog.close();
        openShoppingList();
      });
      recipeList.addEventListener("click", event => {
        const button = event.target.closest("button[data-add-recipe]");
        if (!button) return;
        addRecipeToSelectedDay(button.dataset.addRecipe);
      });
      searchResults.addEventListener("click", event => {
        const recipeButton = event.target.closest("button[data-add-recipe]");
        if (recipeButton) {
          addRecipeToSelectedDay(recipeButton.dataset.addRecipe);
          return;
        }
        const dateButton = event.target.closest("button[data-open-date]");
        if (!dateButton) return;
        const [year, month, day] = dateButton.dataset.openDate.split("-").map(Number);
        selectedDate = new Date(year, month - 1, day);
        searchDialog.close();
        render();
        saveState();
        document.querySelector("#day-strip").scrollIntoView({ behavior: "smooth", block: "start" });
      });

      document.querySelectorAll("[data-nav]").forEach(link => {
        link.addEventListener("click", event => {
          event.preventDefault();
          const sections = {
            Overview: document.querySelector(".summary-grid"),
            "Meal planner": document.querySelector("#day-strip"),
            Nutrition: document.querySelector(".side-stack")
          };
          if (link.dataset.nav === "Recipes") {
            renderRecipeList();
            recipesDialog.showModal();
          } else {
            sections[link.dataset.nav]?.scrollIntoView({ behavior: "smooth", block: "start" });
          }
          document.querySelectorAll("[data-nav]").forEach(item => {
            item.classList.toggle("active", item === link);
            if (item === link) item.setAttribute("aria-current", "page");
            else item.removeAttribute("aria-current");
          });
        });
      });

      render();
      void initializeFirebase();
    })();
