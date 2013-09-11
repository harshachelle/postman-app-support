var User = Backbone.Model.extend({
	defaults: function() {
	    return {
	        "id": 0,
	        "name": "",
	        "access_token": "",
	        "refresh_token": "",
	        "expires_in": 0,
	        "logged_in_at": 0,
	        "link": "",
	        "collections": []
	    };
	},

	setDefaults: function() {
		this.set("id", 0);
		this.set("name", "");
		this.set("access_token", "");
		this.set("refresh_token", "");
		this.set("expires_in", 0);
		this.set("link", "");

		if (pm.features.isFeatureEnabled(FEATURES.USER)) {
			pm.storage.setValue({"user": this.toJSON()}, function() {
			});
		}
	},

	initialize: function() {
		var model = this;

		pm.storage.getValue("user", function(u) {
			if (u) {
				model.set("id", u.id);
				model.set("name", u.name);
				model.set("access_token", u.access_token);
				model.set("refresh_token", u.refresh_token);
				model.set("expires_in", u.expires_in);
				model.set("logged_in_at", u.logged_in_at);

				console.log(u);

				if (pm.features.isFeatureEnabled(FEATURES.USER)) {
					if (u.id !== 0) {
						model.getCollections();
						model.trigger("login", model);
					}

				}
			}
		});

		pm.mediator.on("refreshSharedCollections", this.getCollections, this);
		pm.mediator.on("downloadSharedCollection", this.onDownloadSharedCollection, this);
		pm.mediator.on("deleteSharedCollection", this.onDeleteSharedCollection, this);
		pm.mediator.on("invalidAccessToken", this.onTokenNotValid, this);
	},

	onTokenNotValid: function() {
		// Indicate error
	},

	isLoggedIn: function() {
		return this.get("id") !== 0;
	},

	setAccessToken: function(data) {
		var model = this;

		model.set("access_token", data.access_token);
		model.set("refresh_token", data.refresh_token);
		model.set("expires_in", data.expires_in);
		model.set("logged_in_at", new Date().getTime());

		pm.storage.setValue({"user": model.toJSON()}, function() {
		});
	},

	getRemoteIdForCollection: function(id) {
		var collections = this.get("collections");
		var index = arrayObjectIndexOf(collections, id, "id");

		if (index >= 0) {
			return collections[index].remote_id;
		}
		else {
			return 0;
		}
	},

	login: function() {
		var model = this;

		chrome.identity.launchWebAuthFlow({'url': pm.webUrl + '/client-login', 'interactive': true},
			function(redirect_url) {
				if (chrome.runtime.lastError) {
					pm.mediator.trigger("notifyError", "Could not initiate OAuth 2 flow");
				}
				else {
					var params = getUrlVars(redirect_url, true);

					model.set("id", params.user_id);
					model.set("name", decodeURIComponent(params.name));
					model.set("access_token", decodeURIComponent(params.access_token));
					model.set("refresh_token", decodeURIComponent(params.refresh_token));
					model.set("expires_in", parseInt(params.expires_in, 10));
					model.set("logged_in_at", new Date().getTime());

					console.log(model.toJSON());

					pm.storage.setValue({"user": model.toJSON()}, function() {
					});

					model.getCollections();

					model.trigger("login", model);
					/* Extract token from redirect_url */
				}

			}
		);
	},

	logout: function() {
		var model = this;

		pm.api.logoutUser(this.get("id"), this.get("access_token"), function() {
			model.setDefaults();
			model.trigger("logout");
		});

	},

	getCollections: function() {
		var model = this;

		pm.api.getUserCollections(function(data) {
	    	if (data.hasOwnProperty("collections")) {
		    	for(var i = 0; i < data.collections.length; i++) {
		    		c = data.collections[i];
		    		c.is_public = c.is_public === "1" ? true : false;
		    		c.updated_at_formatted = new Date(c.updated_at).toDateString();
		    	}

		    	console.log("Setting collections", data.collections);

		    	model.set("collections", data.collections);
		    	model.trigger("change:collections");
	    	}
		});
	},

	onDeleteSharedCollection: function(id) {
		var model = this;
		pm.api.deleteSharedCollection(id, function(data) {
			var collections = model.get("collections");
			var index = arrayObjectIndexOf(collections, id, "id");
			var collection = _.clone(collections[index]);
			console.log(collection);

			if (index >= 0) {
				collections.splice(index, 1);
			}

			pm.mediator.trigger("deletedSharedCollection", collection);

			model.trigger("change:collections");
		});
	},

	onDownloadSharedCollection: function(id) {
		console.log("Get collection", id);

		pm.api.getCollectionFromRemoteId(id, function(data) {
			pm.mediator.trigger("overwriteCollection", data);
		});
	}

});