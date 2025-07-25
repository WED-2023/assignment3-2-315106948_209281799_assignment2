// recipes.js — routes for all recipe-related operations

var express = require("express");
var router = express.Router();
const recipes_utils = require("./utils/recipes_utils");
const DButils = require("./utils/DButils");

/**
 * Middleware: Authenticate requests
 * - Logs session data for debugging
 * - If session.user_id exists and matches a DB user, attaches req.user_id
 * - Otherwise sets req.user_id = null to allow public access
 */
router.use(async function (req, res, next) {
  // if (req.session && req.session.user_id) {
  //   DButils.execQuery("SELECT user_id FROM users").then((users) => {
  //     if (users.find((x) => x.user_id === req.session.user_id)) {
  //       req.user_id = req.session.user_id;
  //       console.log("User authenticated: " + req.user_id);
  //       next();
  //     }
  //   }).catch(err => next(err));
  // } else {
  //   req.user_id = null; // Allow unauthenticated access for public endpoints
  //   console.log("No user authenticated, allowing public access");
  //   next();
  // }

  // Duplicated: already handled in main.js and added to the request
  console.log("Session data:", req.session);
  next();
});

/**
 * GET /random
 * - Returns 3 random recipes
 * - If user_id present, enriches with watched/favorite/family flags
 */
router.get("/random", async (req, res, next) => {
  /*This path returns 3 random recipes */
  try{
   const recipes = await recipes_utils.getThreeRandomRecipes(req.user_id);
   res.send(recipes);
  } catch (error) {
    next(error);
  }
}); 

/**
 * GET /search
 * - Validates query parameters
 * - Performs filtered search via Spoonacular
 * - Stores results in session for pagination
 */
router.get("/search", async (req, res, next) => {
  try {
    const { query, number, cuisine, diet, intolerances } = req.query;
    const filters = { cuisine, diet, intolerances };
    if (!query || query.trim().length < 2) {
      return res.status(400).send("Invalid or missing search query.");
    }
    const num = parseInt(number);
    if (number && (isNaN(num) || num < 1 || num > 100)) {
      return res.status(400).send("Invalid 'number' parameter. Must be 1-100.");
    }

    const results = await recipes_utils.searchRecipesWithFilters(req.user_id, query, number, filters);

    // Save the results in the session
    if (req.session)
      req.session.lastSearchResults = results;
    
    res.status(200).send(results);

  } catch (error) {
    if (error.status === 404) {
      res.status(404).send(error.message);
    } else {
      next(error);
    }
  }
});

/**
 * GET /last-search
 * - Returns the last /search results stored in session
 * - Returns 404 if none exist
 */
router.get("/last-search", (req, res) => {
  if (!req.session || !req.session.lastSearchResults || req.session.lastSearchResults === undefined) {
    return res.status(404).send("No previous search found.");
  }
  res.status(200).send(req.session.lastSearchResults);
});

// Bonus
/**
 * POST /meal-plan
 * - Adds a recipe to the logged-in user's meal plan
 * - Requires authenticated user and recipeId in body
 */
router.post("/meal-plan", async (req, res, next) => {
  try {
    const { recipeId } = req.body;
    const userId = req.user_id;
    if (!userId) return res.status(401).send("Unauthorized");
    if (!recipeId) return res.status(400).send("Recipe ID is required");

    // check if the recipe exists
    const recipeInfo = await recipes_utils.getRecipeDetails(userId, recipeId);
    if (!recipeInfo) {
      return res.status(404).send("Recipe not found");
    }
    await recipes_utils.addToMealPlan(userId, recipeId);
    res.status(200).send("Added to meal plan");
  } catch (err) {
    next(err);
  }
});

/**
 * GET /meal-plan
 * - Retrieves the user's meal-plan as ordered preview list
 */
router.get("/meal-plan", async (req, res, next) => {
  try {
    const userId = req.user_id;
    if (!userId) return res.status(401).send("Unauthorized");

    const planRows = await recipes_utils.getMealPlan(userId);
    const recipeIds = planRows.map(r => r.recipe_id);
    const previews = await recipes_utils.getRecipesPreview(userId, recipeIds);

    const result = previews.map(r => {
      const order = planRows.find(p => p.recipe_id === r.id)?.order_index || 999;
      return { ...r, order };
    }).sort((a, b) => a.order - b.order);

    console.log("Session size (JSON):", JSON.stringify(req.session).length, "bytes");

    res.status(200).send(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /meal-plan/remove
 * - Removes a given recipe from the user's meal plan
 */
router.post("/meal-plan/remove", async (req, res, next) => {
  try {
    const { recipeId } = req.body;
    const userId = req.user_id;
    if (!userId) return res.status(401).send("Unauthorized");
    if (!recipeId) return res.status(400).send("Recipe ID is required");

    await recipes_utils.removeFromMealPlan(userId, recipeId);

    // Clear session progress and details
    if (req.session?.recipeProgress?.[recipeId]) {
      delete req.session.recipeProgress[recipeId];
    }
    if (req.session?.recipeDetails?.[recipeId]) {
      delete req.session.recipeDetails[recipeId];
    }

    res.status(200).send("Removed from meal plan");
  } catch (err) {
    next(err);
  }
});
// router.post("/meal-plan/remove", async (req, res, next) => {
//   try {
//     const { recipeId } = req.body;
//     const userId = req.user_id;
//     if (!userId) return res.status(401).send("Unauthorized");
//     if (!recipeId) return res.status(400).send("Recipe ID is required");
//     await recipes_utils.removeFromMealPlan(userId, recipeId);
//     res.status(200).send("Removed from meal plan");
//   } catch (err) {
//     next(err);
//   }
// });

/**
 * POST /meal-plan/reorder
 * - Validates and applies a new order for the meal plan
 */
router.post("/meal-plan/reorder", async (req, res, next) => {
  try {
    const { newOrder } = req.body;
    await recipes_utils.validateMealPlanOrder(req.user_id, newOrder);
    await recipes_utils.reorderMealPlan(req.user_id, newOrder);
    res.status(200).send("Reordered meal plan");
  } catch (err) {
    res.status(400).send({ error: err.message });
  }
});

/**
 * POST /meal-plan/clear
 * - Clears all entries from the user's meal plan
 */
router.post("/meal-plan/clear", async (req, res, next) => {
  try {
    if (!req.user_id) return res.status(401).send("Unauthorized");
    await recipes_utils.clearMealPlan(req.user_id);

    // Also clear all session progress
    if (req.session?.recipeProgress) {
      req.session.recipeProgress = {};
    }
    if (req.session?.recipeDetails) {
      req.session.recipeDetails = {};
    }

    res.status(200).send("Cleared meal plan");
  } catch (err) {
    next(err);
  }
});

// router.post("/meal-plan/clear", async (req, res, next) => {
//   try {
//     if (!req.user_id) return res.status(401).send("Unauthorized");
//     await recipes_utils.clearMealPlan(req.user_id);
//     res.status(200).send("Cleared meal plan");
//   } catch (err) {
//     next(err);
//   }
// });

/**
 * GET /:recipeId
 * - Returns full recipe details by ID
 * - Marks as watched if user is authenticated
 */
router.get("/:recipeId", async (req, res, next) => {
  try {
    if (!req.params.recipeId) {
      return res.status(400).send("Recipe ID is required.");
    }
    const recipe = await recipes_utils.getRecipeDetails(req.user_id, req.params.recipeId);
    if (!recipe) {
      return res.status(404).send("Recipe not found.");
    }
    // if there is a user_id in the session, mark the recipe as watched   
    if (req.user_id) {
      await recipes_utils.markAsWatched(req.user_id, req.params.recipeId);
    }
    res.status(200).send(recipe);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /:recipeId/progress
 * - Initializes or returns existing progress for a recipe
 */
router.get("/:recipeId/progress", async (req, res, next) => {
  try {
    const recipeId = req.params.recipeId;
    if (!recipeId) return res.status(400).send("Recipe ID is required.");
    if (!req.session || !req.user_id) return res.status(401).send("Unauthorized");

    if (!req.session.recipeProgress) req.session.recipeProgress = {};
    // if (!req.session.recipeDetails) req.session.recipeDetails = {};
    const details = await recipes_utils.getRecipeDetails(req.user_id, recipeId);

    // If progress already exists
    if (req.session.recipeProgress[recipeId]) {
      return res.status(200).send({
        steps: req.session.recipeProgress[recipeId].steps,
        // details: req.session.recipeDetails[recipeId]
        details: details
      });
    }

    // Fetch fresh
    const steps = await recipes_utils.getPreparationSteps(recipeId);

    const stepsWithStatus = steps.map(step => ({
      number: step.step,
      isDone: false
    }));

    req.session.recipeProgress[recipeId] = { steps: stepsWithStatus };
    // req.session.recipeDetails[recipeId] = details;

    res.status(200).send({ steps: stepsWithStatus, details });
  } catch (error) {
    next(error);
  }
});


/**
 * POST /:recipeId/progress
 * - Updates a single step or reapplies a multiplier to ingredients
 */
router.post("/:recipeId/progress", async (req, res) => {
  try {
    const recipeId = req.params.recipeId;
    const { stepIndex, isDone, multiplier, steps } = req.body;

    if (!recipeId) return res.status(400).send("Recipe ID is required.");
    if (!req.session || !req.user_id) return res.status(401).send("Unauthorized");

    if (!req.session.recipeProgress){
       req.session.recipeProgress = {};
    }
    // if (!req.session.recipeDetails){
    //    req.session.recipeDetails = {};
    // }

    // Initialize if missing
    if (!req.session.recipeProgress[recipeId]) {
      const originalSteps = await recipes_utils.getPreparationSteps(recipeId);
      req.session.recipeProgress[recipeId] = {
        steps: originalSteps.map(step => ({
          number: step.step,
          isDone: false
        }))
      };
    }

    // if (!req.session.recipeDetails[recipeId]) {
    //   const originalDetails = await recipes_utils.getRecipeDetails(req.user_id, recipeId);
    //   req.session.recipeDetails[recipeId] = originalDetails;
    // }
    const originalDetails = await recipes_utils.getRecipeDetails(req.user_id, recipeId);
    let recipeDetails = originalDetails;

    // Update servings & ingredients
    if (multiplier) {
      // const originalDetails = await recipes_utils.getRecipeDetails(req.user_id, recipeId);
      recipeDetails.ingredients = originalDetails.ingredients.map(ing => ({
        ...ing,
        amount: Math.round((ing.amount * multiplier + Number.EPSILON) * 100) / 100
      }));
      recipeDetails.servings = Math.round((originalDetails.servings * multiplier + Number.EPSILON) * 100) / 100;
    }

    // Save full steps array
    if (Array.isArray(steps)) {
      req.session.recipeProgress[recipeId].steps = steps;
    }

    // Or update a single step
    if (
      Number.isInteger(stepIndex) &&
      stepIndex >= 1 &&
      typeof isDone === "boolean" &&
      req.session.recipeProgress[recipeId].steps?.[stepIndex-1]
    ) {
      req.session.recipeProgress[recipeId].steps[stepIndex-1].isDone = isDone;
    }
    
    res.status(200).send({
      steps: req.session.recipeProgress[recipeId].steps,
      details: recipeDetails
    });
  } catch (error) {
    res.status(500).send("Error updating step progress: " + error.message);
  }
});


module.exports = router;
