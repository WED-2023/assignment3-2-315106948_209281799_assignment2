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

    if (!req.session.recipeProgress) {
      req.session.recipeProgress = {};
    }

    // Return existing full step progress if exists
    if (req.session.recipeProgress[recipeId]) {
      return res.status(200).send(req.session.recipeProgress[recipeId]);
    }

    // Fetch steps from Spoonacular
    const steps = await recipes_utils.getPreparationSteps(recipeId); // array of full step objects

    // Add `isDone: false` to each step
    const progressWithStatus = steps.map(step => ({
      ...step,
      isDone: false
    }));

    // Save full step objects with isDone field into session
    req.session.recipeProgress[recipeId] = progressWithStatus;

    res.status(200).send(progressWithStatus);
  } catch (error) {
    next(error);
  }
});



router.post("/:recipeId/progress", (req, res) => {
  try {
    const recipeId = req.params.recipeId;
    const { stepIndex, isDone } = req.body;

    if (!req.session?.recipeProgress?.[recipeId]) {
      return res.status(400).send("Progress for this recipe not initialized.");
    }

    if (!Number.isInteger(stepIndex) || typeof isDone !== "boolean") {
      return res.status(400).send("Invalid stepIndex or isDone value.");
    }

    req.session.recipeProgress[recipeId][stepIndex].isDone = isDone;

    res.status(200).send("Step progress updated.");
  } catch (error) {
    res.status(500).send("Error updating step progress: " + error.message);
  }
});


module.exports = router;
