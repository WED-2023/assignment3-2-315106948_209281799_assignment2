var express = require("express");
var router = express.Router();
const recipes_utils = require("./utils/recipes_utils");
const DButils = require("./utils/DButils");

/**
 * Authenticate all incoming requests by middleware
 */
router.use(async function (req, res, next) {
  console.log("SESSION DATA:", req.session); 
  console.log("Authenticating user...");
  if (req.session && req.session.user_id) {
    DButils.execQuery("SELECT user_id FROM users").then((users) => {
      if (users.find((x) => x.user_id === req.session.user_id)) {
        req.user_id = req.session.user_id;
        console.log("User authenticated: " + req.user_id);
        next();
      }
    }).catch(err => next(err));
  } else {
    req.user_id = null; // Allow unauthenticated access for public endpoints
    console.log("No user authenticated, allowing public access");
    next();
  }
});

router.get("/random", async (req, res, next) => {
  /*This path returns 3 random recipes */
  try{
   const recipes = await recipes_utils.getThreeRandomRecipes(req.user_id);
   res.send(recipes);
  } catch (error) {
    next(error);
  }
}); 

router.get("/search", async (req, res, next) => {
  try {
    const { query, number, cuisine, diet, intolerances } = req.query;
    const filters = { cuisine, diet, intolerances };
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

router.get("/last-search", (req, res) => {
  if (!req.session || !req.session.lastSearchResults || req.session.lastSearchResults === undefined) {
    return res.status(404).send("No previous search found.");
  }
  res.status(200).send(req.session.lastSearchResults);
});

// Bonus
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

    res.status(200).send(result);
  } catch (err) {
    next(err);
  }
});

router.post("/meal-plan/remove", async (req, res, next) => {
  try {
    const { recipeId } = req.body;
    const userId = req.user_id;
    await recipes_utils.removeFromMealPlan(userId, recipeId);
    res.status(200).send("Removed from meal plan");
  } catch (err) {
    next(err);
  }
});

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

router.post("/meal-plan/clear", async (req, res, next) => {
  try {
    await recipes_utils.clearMealPlan(req.user_id);
    res.status(200).send("Cleared meal plan");
  } catch (err) {
    next(err);
  }
});

/**
 * This path returns a full details of a recipe by its id
 */
router.get("/:recipeId", async (req, res, next) => {
  try {
    const recipe = await recipes_utils.getRecipeDetails(req.user_id, req.params.recipeId);
    // if there is a user_id in the session, mark the recipe as watched   
    if (req.user_id) {
      await recipes_utils.markAsWatched(req.user_id, req.params.recipeId);
    }
    res.send(recipe);
  } catch (error) {
    next(error);
  }
});


router.get("/:recipeId/progress", async (req, res, next) => {
  try {
    const recipeId = req.params.recipeId;

    if (!req.session || !req.user_id) {
      return res.status(401).send("Unauthorized: No active session.");
    }

    // Initialize storage objects
    if (!req.session.recipeProgress) req.session.recipeProgress = null;
    if (!req.session.recipeDetails) req.session.recipeDetails = null;
    if (req.session.recipeProgress?.recipeId === recipeId) {
      return res.status(200).send({
        steps: req.session.recipeProgress.steps,
        details: req.session.recipeDetails
      });
    }

    // Fetch new data
    const steps = await recipes_utils.getPreparationSteps(recipeId);
    const details = await recipes_utils.getRecipeDetails(req.user_id, recipeId);

    const stepsWithStatus = steps.map(step => ({
      ...step,
      isDone: false
    }));

    // Save only this recipe’s progress/details
    req.session.recipeProgress = {
      recipeId,
      steps: stepsWithStatus
    };
    req.session.recipeDetails = details;

    res.status(200).send({ steps: stepsWithStatus, details });
  } catch (error) {
    next(error);
  }
});



router.post("/:recipeId/progress", async (req, res) => {
  try {
    const recipeId = req.params.recipeId;
    if (!recipeId) {
      return res.status(400).send("Recipe ID is required.");
    }
    const { stepIndex, isDone, multiplier } = req.body;

    if (!req.session || !req.user_id) {
      return res.status(401).send("Unauthorized: No active session.");
    }

    if (!req.session.recipeProgress || req.session.recipeProgress.recipeId !== recipeId) {
      const steps = await recipes_utils.getPreparationSteps(recipeId);
      const details = await recipes_utils.getRecipeDetails(req.user_id, recipeId);
      const m = parseFloat(multiplier) || 1;

      if (m !== 1){  // If a multiplier is provided, adjust ingredient amounts
        details.ingredients = details.ingredients.map(ing => ({
          ...ing,
          amount: Math.round((ing.amount * m + Number.EPSILON) * 100) / 100
        }));
        details.servings = Math.round((details.servings * m + Number.EPSILON) * 100) / 100;
      }

      const stepsWithStatus = steps.map(step => ({
        ...step,
        isDone: false
      }));

      req.session.recipeProgress = {
        recipeId,
        steps: stepsWithStatus
      };
      req.session.recipeDetails = details;
    }
    else {
      // If the recipe is already in session, use existing progress
      // check if need to adjust ingredients amounts
      const m = parseFloat(multiplier) || 1;
      if (m !== 1) {
        // re-fetch the recipe details to adjust ingredients
        const originalDetails = await recipes_utils.getRecipeDetails(req.user_id, recipeId);
        req.session.recipeDetails.ingredients = originalDetails.ingredients.map(ing => ({
          ...ing,
          amount: Math.round((ing.amount * m + Number.EPSILON) * 100) / 100
        }));
        
      }
    }

    if (Number.isInteger(stepIndex) && stepIndex >= 0 && stepIndex < req.session.recipeProgress.steps.length && typeof isDone === "boolean") {
      req.session.recipeProgress.steps[stepIndex].isDone = isDone;
    }

    res.status(200).send({
      steps: req.session.recipeProgress.steps,
      details: req.session.recipeDetails
    });
  } catch (error) {
    res.status(500).send("Error updating step progress: " + error.message);
  }
});



module.exports = router;
