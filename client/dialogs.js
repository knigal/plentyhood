///////////////////////////////////////////////////////////////////////////////
// Create Place dialog

var unsetActiveDialog = function (name) {
  var currActiveDialog = Session.get("activeDialog");
  if (currActiveDialog && (currActiveDialog == name || !name)) {
    //     console.log("removing active dialog:", currActiveDialog);
    Session.set("activeDialog", undefined);
  }
};

var bsModalOnShow = function (name) {
  $('#eModalDialog').modal();
  $('#eModalDialog').on('hide.bs.modal', function () {
    unsetActiveDialog(name);
  })
}

var bsModalOnHide = function (name) {
  $('#eModalDialog').modal('hide');
}

Template.placeEditDialog.rendered = function () {
  bsModalOnShow("placeEdit");
  $("#eModalDialog").on('shown', function () {
    $("input.title").focus();
  });
};

Template.placeEditDialog.events({
  'click .save': function (event, template) {
    var title = template.find(".title").value;
    var description = template.find(".description").value;
    var pub = ! template.find(".private").checked;
    var location = Session.get("placeLocation");
    if (title.length && description.length) {
      var placeId = Session.get("selectedPlace");
      var doc = {
        title: title,
        description: description,
        location: location,
        public: pub
      };
      if (placeId) {
        doc.placeId = placeId;
      }
      Meteor.call('mtcPlaceUpdate', doc, function (error, place) {
        if (error) {
          console.log("placeEdit failed!", error);
        }
        else {
          if (!placeId) {
            client.placeSet(place);
            Session.set("searchTags", undefined);
          }
          if (!pub && Meteor.users.find().count() > 1) {
            openInviteDialog();
          }
        }
      });
      bsModalOnHide("placeEdit");
    } else {
      Session.set("createError",
                  "It needs a title and a description, or why bother?");
    }
  },
  'click .cancel': function () {
    bsModalOnHide();
  }
});

Template.placeEditDialog.selectedPlace = function () {
  return !!Session.get("selectedPlace");
};

Template.placeEditDialog.isPrivate = function () {
  var id = Session.get("selectedPlace");
  if (id) {
    return !App.collections.Places.findOne(id).public;
  }
};

Template.placeEditDialog.title = function () {
  var id = Session.get("selectedPlace");
  if (id) {
    return App.collections.Places.findOne(id).title;
  }
};

Template.placeEditDialog.description = function () {
  var id = Session.get("selectedPlace");
  if (id) {
    return App.collections.Places.findOne(id).description;
  }
};

Template.placeEditDialog.error = function () {
  return Session.get("createError");
};

///////////////////////////////////////////////////////////////////////////////
// Invite dialog

var openInviteDialog = function () {
  Session.set("activeDialog", "invite");
};

Template.inviteDialog.events({
  'click .invite': function (event, template) {
    Meteor.call('mtcInvite', Session.get("selectedPlace"), this._id);
  },
  'click .done': function (event, template) {
    bsModalOnHide();
    return false;
  }
});

Template.inviteDialog.rendered = function () {
  bsModalOnShow("invite");
};

Template.inviteDialog.uninvited = function () {
  var place = App.collections.Places.findOne(Session.get("selectedPlace"));
  if (! place)
    return []; // place hasn't loaded yet
  return Meteor.users.find({$nor: [{_id: {$in: place.invited}},
                                   {_id: place.owner}]});
};

Template.inviteDialog.displayName = function () {
  return client.displayName(this);
};

///////////////////////////////////////////////////////////////////////////////
// dialogs

Template.dialogs.isDialogActive = function () {
  return !!Session.get("activeDialog");
};

Template.dialogs.isPlaceResourceUpdateActive = function () {
  return Session.equals("activeDialog", "resourceUpdate");
};

Template.dialogs.isPlaceEditActive = function () {
  return Session.equals("activeDialog", "placeEdit");
};

Template.dialogs.isInviteActive = function () {
  return Session.equals("activeDialog", "invite");
};

///////////////////////////////////////////////////////////////////////////////
// Add resource dialog


var isCreateNewResource = function () {
  return Session.equals("resourceCreateNew", true);
};

Template.resourceUpdateDialog.createNew = function () {
  return isCreateNewResource();
};

Template.resourceUpdateDialog.title = function () {
  return isCreateNewResource() ? "" : client.selectedResourceGet().title;
};

Template.resourceUpdateDialog.description = function () {
  return isCreateNewResource() ? "" : client.selectedResourceGet().description;
};

Template.resourceUpdateDialog.isPrivate = function () {
  return isCreateNewResource() ? "" : !client.selectedResourceGet().public;
};

Template.resourceUpdateDialog.tags = function () {
  if (isCreateNewResource()) {
    return "";
  }
  var tagsStr = "";
  _.each(client.selectedResourceGet().tags, function (t) {
    if (tagsStr) {
      tagsStr += ",";
    }
    var name = App.collections.Tags.findOne(t).title;
    //     console.log("tag", t, name);
    tagsStr += name;
  });
  return tagsStr;
};

Template.resourceUpdateDialog.saveDisabled = function () {
  return Session.get("saveDisabled") ? "disabled" : "";
};

Template.resourceUpdateDialog.rendered = function () {
  bsModalOnShow("resourceUpdate");
  var tif = $('.tagsInputField');
  tif.removeData('tagsinput');
  tif.tagsinput(client.tagsInputOptions());
  $("#eModalDialog").on('shown', function () {
    $("input.title").focus();
  });
  //   console.log("resourceUpdateDialog->rendered");
};

Template.resourceUpdateDialog.events({
  'click .save': function (event, template) {
    //     console.log("resourceUpdateDialog->save");
    if (!_.isUndefined(event.target.attributes.disabled)) {
      return;
    }
    var title = template.find(".title").value;
    var description = template.find(".description").value;
    var pub = !template.find(".private").checked;
    var tags = $(".tagsInputField").tagsinput('items');
    //     console.log("title", title, "description", description, 
    //     "pub", pub, "tags", tags);
    var args = { 
      placeId: Session.get("selectedPlace"),
      title: title,
      tags: tags,
      description: description,
      public: pub,
    }
    if (!isCreateNewResource()) {
      args.resourceId = Session.get("selectedResource");
    }
    if (title && tags.length) {
      Meteor.call("mtcResourceUpdate", args, function (error, result) {
        if (error) {
          console.log("error: " + error);
          Session.set("resourceUpdateError", error.toString());
        }
        else {
          console.log("added/updated resource", result);
          Session.set("selectedResource", result);
          bsModalOnHide();
        }
      });
    } else {
      Session.set("resourceUpdateError", "Title and tags must be provided");
    }
  },
  'click .cancel': function () {
    bsModalOnHide();
  }
});

Template.resourceUpdateDialog.error = function () {
  return Session.get("resourceUpdateError");
};

