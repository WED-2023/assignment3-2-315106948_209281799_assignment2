const DButils = require("./DButils");

async function markAsFavorite(user_id, recipe_id){
    await DButils.execQuery(`insert into favorite_recipes values ('${user_id}',${recipe_id})`);
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
