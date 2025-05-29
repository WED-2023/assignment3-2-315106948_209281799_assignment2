var express = require("express");
var router = express.Router();
const recipes_utils = require("./utils/recipes_utils");

router.get("/", async (req, res, next) => {
  /*get 3 random recipes */
  try{
   const recipes = await recipes_utils.getThreeRandomRecipes();
   res.send(recipes);
  } catch (error) {
    next(error);
  }
}); 


/**
 * This path returns a full details of a recipe by its id
 */
router.get("/:recipeId", async (req, res, next) => {
  try {
    const recipe = await recipes_utils.getRecipeDetails(req.params.recipeId);
    res.send(recipe);
  } catch (error) {
    next(error);
  }
});

/**This path return number of full detalis of reipes by name */
router.get("/byName/{name}", async (req, res, next) => {
  try {
    const recipes = await recipes_utils.getRecipeDetailsByName(req.params.recipeName, req.query.number);
    res.send(recipes);
  } catch (error) {
    next(error);
  }
});


router.post("/", async (req, res, next) => {
  try {
    const recipe = req.body;
    if (!recipe || !recipe.id || !recipe.title || !recipe.readyInMinutes || !recipe.image || !recipe.popularity || !recipe.vegan || !recipe.vegetarian || !recipe.glutenFree) {
      return res.status(400).send("Invalid recipe data");
    }
    const newRecipe = await recipes_utils.addRecipe(recipe);
    res.status(201).send(newRecipe);
  } catch (error) {
    if (error.status === 409) {
      res.status(409).send(error.message);
    }
    else{
      next(error);
    }
  }
});
module.exports = router;
