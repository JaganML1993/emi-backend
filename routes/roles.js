const express = require('express');
const RoleMenuAccess = require('../models/RoleMenuAccess');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// Default menu paths for the application
const MENU_PATHS = [
  { path: '/dashboard', name: 'Dashboard' },
  { path: '/payments', name: 'Payments' },
  { path: '/house-savings', name: 'House Savings' },
  { path: '/users', name: 'Users' },
  { path: '/user-profile', name: 'User Profile' },
  { path: '/emi-forecast', name: 'EMI Forecast' },
  { path: '/roles-management', name: 'Roles Management' }
];

// @desc    Get allowed menu paths for current user
// @route   GET /api/roles/my-permissions
// @access  Private
router.get('/my-permissions', protect, async (req, res) => {
  try {
    const role = req.user.role || 'user';
    const permissions = await RoleMenuAccess.find({ role, allowed: true }).select('path');
    const paths = permissions.map(p => p.path);

    // If no permissions in DB, use defaults: admin and super_admin see all, user sees non-admin menus
    if (paths.length === 0) {
      const defaultPaths = (role === 'admin' || role === 'super_admin')
        ? MENU_PATHS.map(m => m.path)
        : MENU_PATHS.filter(m => m.path !== '/roles-management' && m.path !== '/users').map(m => m.path);
      return res.json({ success: true, paths: defaultPaths });
    }

    res.json({ success: true, paths });
  } catch (error) {
    console.error('Get permissions error:', error);
    res.status(500).json({ success: false, message: 'Error fetching permissions' });
  }
});

// @desc    Get all role permissions (for Roles Management page)
// @route   GET /api/roles/permissions
// @access  Private/Admin
router.get('/permissions', protect, authorize('admin', 'super_admin'), async (req, res) => {
  try {
    const permissions = await RoleMenuAccess.find().sort({ role: 1, path: 1 });

    // Build structure: { super_admin: {...}, admin: {...}, user: {...} }
    const byRole = { super_admin: {}, admin: {}, user: {} };
    MENU_PATHS.forEach(m => {
      byRole.super_admin[m.path] = true;
      byRole.admin[m.path] = true;
      byRole.user[m.path] = m.path !== '/roles-management' && m.path !== '/users';
    });

    permissions.forEach(p => {
      if (byRole[p.role] !== undefined && MENU_PATHS.some(m => m.path === p.path)) {
        byRole[p.role][p.path] = p.allowed;
      }
    });

    res.json({
      success: true,
      permissions: byRole,
      menuPaths: MENU_PATHS
    });
  } catch (error) {
    console.error('Get permissions error:', error);
    res.status(500).json({ success: false, message: 'Error fetching permissions' });
  }
});

// @desc    Update role permissions
// @route   PUT /api/roles/permissions
// @access  Private/Admin
router.put('/permissions', protect, authorize('admin', 'super_admin'), async (req, res) => {
  try {
    const { role, path, allowed } = req.body;

    if (!role || !path || !['super_admin', 'admin', 'user'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role or path' });
    }

    const validPath = MENU_PATHS.some(m => m.path === path);
    if (!validPath) {
      return res.status(400).json({ success: false, message: 'Invalid menu path' });
    }

    await RoleMenuAccess.findOneAndUpdate(
      { role, path },
      { allowed: !!allowed },
      { upsert: true, new: true }
    );

    const permissions = await RoleMenuAccess.find({ role, path: path });
    res.json({ success: true, message: 'Permission updated' });
  } catch (error) {
    console.error('Update permission error:', error);
    res.status(500).json({ success: false, message: 'Error updating permission' });
  }
});

// @desc    Bulk update role permissions
// @route   PUT /api/roles/permissions/bulk
// @access  Private/Admin
router.put('/permissions/bulk', protect, authorize('admin', 'super_admin'), async (req, res) => {
  try {
    const { permissions } = req.body; // { admin: { '/dashboard': true, ... }, user: { ... } }

    if (!permissions || typeof permissions !== 'object') {
      return res.status(400).json({ success: false, message: 'Invalid permissions format' });
    }

    const bulkOps = [];
    for (const role of ['super_admin', 'admin', 'user']) {
      if (!permissions[role] || typeof permissions[role] !== 'object') continue;
      for (const path of MENU_PATHS.map(m => m.path)) {
        const allowed = permissions[role][path];
        if (typeof allowed === 'boolean') {
          bulkOps.push({
            updateOne: {
              filter: { role, path },
              update: { $set: { allowed } },
              upsert: true
            }
          });
        }
      }
    }

    if (bulkOps.length > 0) {
      await RoleMenuAccess.bulkWrite(bulkOps);
    }

    res.json({ success: true, message: 'Permissions updated successfully' });
  } catch (error) {
    console.error('Bulk update error:', error);
    res.status(500).json({ success: false, message: 'Error updating permissions' });
  }
});

module.exports = router;
