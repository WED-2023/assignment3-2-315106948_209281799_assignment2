const DButils = require("./DButils");

const escape = s => String(s).replace(/'/g, "''");

async function markAsFavorite(user_id, recipe_id) {
  const safeRecipe = escape(recipe_id);
  // user_id is numeric so no need to escape, but you can if it's a string:
  const query = `
    INSERT INTO favorite_recipes (user_id, recipe_id)
    VALUES (${user_id}, '${safeRecipe}');
  `;
  await DButils.execQuery(query);
}

async function getFavoriteRecipes(user_id){
    const recipes_id = await DButils.execQuery(`select recipe_id from favorite_recipes where user_id='${user_id}'`);
    return recipes_id;
}


async function getThreeWatchedRecipes(user_id){
        const query = `
        SELECT recipe_id
        FROM watched_recipes
        WHERE user_id = '${user_id}'
        ORDER BY watched_at DESC
        LIMIT 3;
    `;
    const result = await DButils.execQuery(query);
    return result;
}



exports.markAsFavorite = markAsFavorite;
exports.getFavoriteRecipes = getFavoriteRecipes;
exports.getThreeWatchedRecipes = getThreeWatchedRecipes;
