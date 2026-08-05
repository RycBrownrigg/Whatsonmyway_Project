# **High-Level Description**

I want to build an application called ‘What's On My Way’. It will allow a user to search for a route from point A to point B and find points of interest along the way. It will support stand-alone databases called ‘Packs’ that people can purchase, each focused on a specific type of point of interest, for example, all the Waffle House restaurants or unusual roadside attractions in the United States. I want to include a login capability tied to the Apple Store, so that when packs are purchased, they can only be used by that account. This should work on iPhones and iPads to start.

# **Packs**

The packs will contain specific types of points of interest in a database format. They will also include filters in the pack that allow users to sort or adjust their search. These filters will be specific to a pack and not part of the application. For example, the Waffle House pack may have filters for 24 hours, delivery, takeout, or dine-in, and when a user selects them, only those points of interest in that pack are displayed.

There should also be the ability to create State packs. They will be created from the master database (see database) and will contain all points of interest in that state, along with all filters for each point of interest. For example, a state pack might include a point of interest with 24-hour service, delivery, takeout, or dine-in, along with another point of interest that has dog-friendly, playground, and restroom filters. The state pack would show all the points of interest and all the filters for the various types of points of interest. For states, since there will be different types of points of interest with different filters, when a user selects a distance from the route, the application will only show filters for points of interest within that selection. So, for the example above, if the point of interest with dog-friendly, playground, and restroom is not within the distance from the route selected by the user, its filters would not show up. 

If a user has multiple packs installed on their system, another set of filters should be available, allowing the user to select which pack (s) they want to include in their search. For example, if the user has a pack with 24-hour, delivery, takeout, or dine-in filters (say, Waffle House) along with a pack with dog-friendly, playground, and restroom filters (say, roadside rest stops), the option to select the packs they want should be in an area listing the packs, and the filters for those packs should be in a separate area, with the filters for the unselected packs shown but not selectable or grayed out.

There should also be a way to build the ‘framework’ of the pack, which would list the required fields, the data type for each field, and the filters specific to the pack

Packs should be usable only by the Apple account that downloads them, whether they are free or paid.

# **The Main Application**

The product specification for the main application, which will be used to connect packs to it. It will allow a user to set a starting and an ending point for the route. There will also be a selection of distances off the route to use in the search. The selection will be 1, 5, 10, 25, and 50 miles.  

It should check for updates to the application and to the installed packs, as well as for any new packs.

Again, there should be a way to tie the application to the user and the packs the user has the rights to.

# **Database** 

A database design is also needed for the packs. Every point of interest in a pack should include the following;
- name
- address (street, city, state, zip)
- phone number (optional)
- website (optional)

There should also be an option to include additional data fields specific to the pack. 

Each pack will also have a pack-specific set of filters, which are defined during the pack's design. (see packs)

There should also be a master database that contains all the points of interest from all the packs. If a new point of interest is discovered, it can be added to the master. Then there would be a tool to create or update a pack based on a point-of-interest type.

There should be a way to add a new point of interest, and, depending on how the search for points of interest is done to find those along the route, the location should be encoded with the correct information to enable the search.

There should also be an import of a dataset from a file. When it is imported, the data should be checked for invalid or missing values at any points of interest, and any incorrect records should be flagged for manual correction.  If the dataset is missing a field necessary for the pack, the import should stop and report the error. The final step of the import is to encode the location for the search.


