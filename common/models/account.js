'use strict';
var async = require('async');
var ObjectID = require('mongodb').ObjectID;
module.exports = function(Account) {
    //create the role per user
    Account.observe('after save', function(ctx, next) {
        console.log('Account:after save');
        console.log(ctx.instance);
        var Role = Account.app.models.Role;
        if(!ctx.isNewInstance) return next();
        if(!ctx.instance) return next();
        if(!ctx.instance.roleId) return next();
        if(!ctx.instance.id) return next();

        let accountId = ctx.instance.id;

        let relation = {
            principalType: Account.app.models.RoleMapping.USER,
            principalId: accountId instanceof ObjectID ? accountId : ObjectID(accountId)
        };

        // validating some parameters

        console.log('parameters');
        console.log(ctx.instance);

        async.waterfall([
            //Find the role object
            function(next){
                Role.findById(ctx.instance.roleId, next);
            },
            // Find if the relation exists
            function(role, next){
                console.log('role');
                console.log(role);
                if(role){
                    role.principals.findOne({ where: relation },
                    function(err, principal){
                        if(err) return next(err);
                        next(null, role, principal);
                    });
                } else {
                    console.log('Role does not exist yet');
                    next(null, null, null);
                }
            },
            // Create the relation just in case
            // it does not exist yet
            function(role, principal, next){
                if(!role && !principal) return next();
                if(!principal){
                    if(role.principals){
                        role.principals.create(relation, next);
                    } else {
                        next();
                    }
                } else {
                    next(new Error('Account already has this role'));
                }
            }
        ], function(err){
            if(err) return console.log(err);
            console.log('the role has been created succesfully');
            next();
        });
    });

    Account.afterRemote('login', (context, instance, next) => {
      console.log('afterRemote: login');
      console.log(instance);
        if(!instance) return next();
        async.waterfall([
            // Get roles per user
            function(next){
                Account.getRolesById(instance.userId, next);
            },
            // Get all roles
            function(userRoles, next){
                getAllRoles(function(err, allRoles){
                    if(err) return next(err);
                    next(null, userRoles, allRoles);
                });
            },
            // add roles and matrix to each user
            // once he has already logged into the system
            function(userRoles, allRoles,  next){
                if(!userRoles) return next();
                if(!allRoles) return next();
                console.log('user roles');
                console.log(userRoles);
                console.log('all roles');
                console.log(allRoles);
                // Get the matrix
                Account.app.models.Resource.find({
                    include: {
                        relation: 'role',
                        scope: {
                            fields: ['name']
                        }
                    }
                }, function(err, resources){
                    if(err) return next(err);
                    if(!(resources && resources.length > 0)) return next();
                    instance.roles = userRoles;
                    instance.matrix = getRolResource(allRoles, resources);
                    next();
                });
            }
        ], next);
    });

    function getRolResource(roles, resources){
        var _roles = [];
        roles.forEach(function(role){
        var _resources = resources.
                filter(function(resource){
                    return (role.name === resource.role().name)
                }).
                map(function(resource){
                    return {
                        id: resource.id,
                        module: resource.module,
                        permissions: resource.permissions,
                    }
                });
            _roles.push({
                role: {
                    name: role.name,
                    resources: _resources
                }
            })
        });
        return _roles;
    }

    function getAllRoles(next){
        Account.app.models.Role.find({}, function(err, roles){
            if(err) return next(err);
            next(null, roles);
        });
    }

    Account.getRolesById = function (id, next) {
        Account.app.models.Role.getRoles({
            principalType: Account.app.models.RoleMapping.USER,
            principalId: id
        }, function(err, roles) {
            if (err) { next(err); }
            var output = [];
            async.each(roles, function(role, next){
                Account.app.models.Role.findById(role, function(err, role){
                    if (role) { output.push(role); }
                    next();
                });
            }, err => {
                if (err) { next(err); }
                next(null, output);
            });
        });
    };

};
