# Version 1.1.0 Plan

- Sort options alphabetically in the UI: All lists shown in the UI need to be displayed alphabetically on the chosen language:checkbox options, dropdown options, value list
- Pre-fill values from map into the `TEXT` field type as readonly: We need a field type that displays a list based on a map of values from an options reference

  - example of a map for the Allergen field, based on the Ingredient field:

    ```json
    {
      "valueSet": {
        "dependsOn": "ING",
        "valuesMap": {
          "Onions": ["None"],
          "Potatoes": ["None"],
          "Broccoli": ["None"],
          "Aubergines": ["None"],
          "Carrots": ["None"],
          "Tomatoes": ["None"],
          "Peppers": ["None"],
          "Cauliflower": ["None"],
          "Squash": ["None"],
          "Yogurt": ["Milk"],
          "Pesto": ["Milk", "Peanuts"]
        }
      }
    }
    ```

  - expected payload for the Allergen field, when the Ingredient field is "Pesto": "Milk, Peanuts"

    ```json
    {
      "ING": "Pesto",
      "ALLERGEN": "Milk, Peanuts"
    }
    ```

- For line item groups create sub groups with headers. The header section will drive selection effects for the line item sub group similarly as the current behaviour between one line item group row and a target line item group.

  - The header will have fields enabled with data source and selection effects configuration, driving row behaviour for the line item sub group
  - We need to be able to add subgroups in this section and line items, manually, inside each sub group. The line items addition must support existing functionalities like optionFilter, selectionSelector, addMode, etc…
  - In theory we could keep the same structure for field configuration that we have today. We could add a dependency between two line items groups, where one is the header defining the amount of subgroups to show, and the child line item group defines the line items that go inside each subgroup.
  - This new line item subgroup structure need to be displayed in both summary and pdf views. We will have multiple sub groups, example of one sub group:

    | RECIPE            | NUMBER_OF_PORTIONS | DISH_TYPE |
    | ----------------- | ------------------ | --------- |
    | Vegetables Bulgur | 4                  | Lunch     |

    | ING                      | QTY     | UNIT  | ALLERGEN |
    | ------------------------ | ------- | ----- | -------- |
    | Bulgur (wheat)           | 14.40   | kg    | GLUTEN   |
    | Couscous mix (frozen)    | 8       | bag   | GLUTEN   |
    | Frozen onions            | 2.67    | bag   | None     |
    | Tomato paste             | 2133.33 | g     | None     |
    | Garlic paste             | 400     | g     | None     |
    | Mozzarella grated cheese | 2000    | g     | Milk     |
    | Salt                     | 10.67   | other | None     |
    | Coriander                | 10.67   | other | None     |
    | Black pepper             | 16      | other | None     |

  - Result data example: We are registering two dishes, one with two line items and one with three line items.

    ```json
    [
      {
        "RECIPE": "Vegetables Bulgur",
        "NUMBER_OF_PORTIONS": 4,
        "DISH_TYPE": "Lunch",
        "Ingredients": [
          {
            "ING": "Bulgur (wheat)",
            "QTY": "14.40",
            "UNIT": "kg",
            "CAT": "Dry carbohydrates",
            "ALLERGEN": "GLUTEN"
          },
          {
            "ING": "Couscous mix (frozen)",
            "QTY": "8",
            "UNIT": "bag",
            "CAT": "Frozen vegetables",
            "ALLERGEN": "GLUTEN"
          }
        ]
      },
      {
        "RECIPE": "Vegetables Bulgur with Mozzarella",
        "NUMBER_OF_PORTIONS": 4,
        "DISH_TYPE": "Lunch",
        "Ingredients": [
          {
            "ING": "Bulgur (wheat)",
            "QTY": "14.40",
            "UNIT": "kg",
            "CAT": "Dry carbohydrates",
            "ALLERGEN": "GLUTEN"
          },
          {
            "ING": "Couscous mix (frozen)",
            "QTY": "8",
            "UNIT": "bag",
            "CAT": "Frozen vegetables",
            "ALLERGEN": "GLUTEN"
          },
          {
            "ING": "Mozzarella grated cheese",
            "QTY": "2000",
            "UNIT": "g",
            "CAT": "Dairy",
            "ALLERGEN": "Milk"
          }
        ]
      }
    ]
    ```

- Any field that is using `dataSource` can define one field from the data source to be used to display a tool tip. When we hover over the tool tip an overlay appears with the content of the referenced field. This is available in both form and summary view. Inline option metadata is also allowed but treated as fallback if data source is present.
- The ITEM_FILTER does not need to be displayed for line items in summary view, this is only a data entry helper for the form. This needs to apply on the new subgroups structure as well.
- Consolidated aggregation must be configurable to be displayed in summary view as well as in the pdf, ex: `{{CONSOLIDATED(MP_INGREDIENTS_LI.ALLERGEN)}}`. This needs to work on the new subgroups structure as well, for line items that are part of a subgroup, the shape could be something like this: `{{CONSOLIDATED(MP_DISHES.INGREDIENTS.ALLERGEN)}}`.
