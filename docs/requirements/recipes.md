UX Review – Recipes Form (Final v4)
Context
This UX review assumes:
• No user training
• Very limited time available for users
• Usage mainly on mobile devices
• Kitchen environment (speed, interruptions, gloves, stress)

User question
What can be improved in terms of UX?

What already works well
• Mobile-first vertical layout suitable for one-handed use
• Increment/decrement controls reduce typing and errors
• Ingredient-level allergen management supports compliance
• Category-first filtering already reduces long ingredient lists

Main UX issues for untrained, time-poor users
• Mandatory category-first flow adds extra taps when users already know the ingredient
• Inefficient horizontal space usage causing label wrapping
• Repetition of labels that could be implied by context
• Ingredient entry flow optimised for structure rather than speed

How to better utilise screen space
• Use stacked labels instead of side-by-side labels to avoid wrapping
• Combine Quantity and Unit on the same row
• Replace repeated column labels with section headers
• Hide empty values and non-applicable columns
• Prefer collapsible sections for secondary information

Ingredient selection – hybrid search + category model (recommended)
Ingredient category selection is currently used to reduce the list of selectable ingredients. This approach is valid and should be preserved.

To further optimise speed for time-constrained users, the UI should additionally allow direct ingredient search by name.

Recommended behaviour:
• The Ingredient field supports free-text search with auto-complete
• Search results span all categories but are limited to a small, relevant list
• When an ingredient is selected via search, the system automatically assigns its category, default unit, and allergens
• Category selection remains available as an alternative way to filter ingredients

Concrete example:
User types: "chi"
System suggests:
• Chicken breast (Meat)
• Chicken thigh (Meat)
• Chickpeas – canned (Legumes)
• Chickpeas – dry (Legumes)

User selects: Chicken breast
System automatically:
• Sets Category = Meat
• Sets default Unit = kg
• Links allergens (none)
• Displays quantity selector immediately

Result:
• One interaction instead of three
• Faster entry with fewer errors
• No training required

Date format consistency
All dates must be displayed using the format:
EEE, dd-mmm-yyyy (e.g. Thu, 25-Apr-2024)
Hours and minutes must not be displayed.
Key UX success criteria
• A new user can complete the form without explanation
• Ingredient entry takes seconds, not minutes
• The form can be completed in under one minute
• Users rarely need to scroll horizontally
• Defaults prevent most errors
