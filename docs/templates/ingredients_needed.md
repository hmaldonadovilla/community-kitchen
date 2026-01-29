# Ingredients needed

| Category | Ingredient | Quantity | Allergen |
| :---- | :---- | ----- | :---- |
| {{MP_MEALS_REQUEST.MP_TYPE_LI.MP_INGREDIENTS_LI.CAT}} {{ORDER_BY(CAT ASC, ING ASC)}} {{EXCLUDE_WHEN_WHEN({"not":{"any":[{"all":[{"fieldId":"PREP_TYPE","equals":"Cook"},{"fieldId":"RECIPE","notEmpty":true}]},{"all":[{"fieldId":"PREP_TYPE","equals":"Full"},{"fieldId":"__ckRowSource","equals":"manual"}]}]}})}} | {{MP_MEALS_REQUEST.MP_TYPE_LI.MP_INGREDIENTS_LI.ING}} | {{MP_MEALS_REQUEST.MP_TYPE_LI.MP_INGREDIENTS_LI.QTY}} {{MP_MEALS_REQUEST.MP_TYPE_LI.MP_INGREDIENTS_LI.UNIT}} | {{MP_MEALS_REQUEST.MP_TYPE_LI.MP_INGREDIENTS_LI.ALLERGEN}} {{CONSOLIDATED_TABLE(MP_MEALS_REQUEST.MP_TYPE_LI.MP_INGREDIENTS_LI)}} |
