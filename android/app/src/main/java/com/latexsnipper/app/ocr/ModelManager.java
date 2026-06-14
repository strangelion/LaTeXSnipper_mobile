package com.latexsnipper.app.ocr;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import org.json.JSONObject;

import java.io.File;

/**
 * ModelManager — manages model file paths, active selections, and installation status.
 * Models are stored in app private dir: /models/{category}/{variantId}/
 */
public class ModelManager {

    private static final String TAG = "ModelManager";
    private static final String PREFS_NAME = "ModelManagerPrefs";
    private static final String KEY_ACTIVE = "active_models";

    private final Context context;
    private final File modelsDir;

    public ModelManager(Context context) {
        this.context = context;
        this.modelsDir = new File(context.getFilesDir(), "models");
        if (!modelsDir.exists()) modelsDir.mkdirs();
    }

    public File getModelsDir() { return modelsDir; }

    public File getCategoryDir(String category) {
        File dir = new File(modelsDir, category);
        if (!dir.exists()) dir.mkdirs();
        return dir;
    }

    /**
     * Get the path to a specific model file.
     * @return File path, or null if not found
     */
    public File getModelFile(String category, String variantId, String filename) {
        File file = new File(getCategoryDir(category), variantId + "/" + filename);
        return file.exists() ? file : null;
    }

    /**
     * Check if a variant is installed (all its files exist).
     */
    public boolean isInstalled(String category, String variantId, String[] files) {
        for (String f : files) {
            File file = getModelFile(category, variantId, f);
            if (file == null) return false;
        }
        return true;
    }

    /**
     * Get the active variant for a category.
     */
    public String getActiveVariant(String category) {
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String activeJson = prefs.getString(KEY_ACTIVE, "{}");
            JSONObject active = new JSONObject(activeJson);
            return active.optString(category, null);
        } catch (Exception e) {
            Log.e(TAG, "getActiveVariant failed", e);
            return null;
        }
    }

    /**
     * Set the active variant for a category.
     */
    public void setActiveVariant(String category, String variantId) {
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String activeJson = prefs.getString(KEY_ACTIVE, "{}");
            JSONObject active = new JSONObject(activeJson);
            active.put(category, variantId);
            prefs.edit().putString(KEY_ACTIVE, active.toString()).apply();
            Log.d(TAG, "Set active: " + category + " -> " + variantId);
        } catch (Exception e) {
            Log.e(TAG, "setActiveVariant failed", e);
        }
    }

    /**
     * List installed variant IDs for a category.
     */
    public String[] listInstalled(String category) {
        File catDir = getCategoryDir(category);
        String[] dirs = catDir.list();
        if (dirs == null) return new String[0];
        java.util.List<String> installed = new java.util.ArrayList<>();
        for (String d : dirs) {
            File vDir = new File(catDir, d);
            if (vDir.isDirectory()) {
                String[] files = vDir.list((dir, name) -> name.endsWith(".onnx"));
                if (files != null && files.length > 0) {
                    installed.add(d);
                }
            }
        }
        return installed.toArray(new String[0]);
    }

    /**
     * Delete all files for a specific variant.
     */
    public boolean deleteVariant(String category, String variantId) {
        File vDir = new File(getCategoryDir(category), variantId);
        if (!vDir.exists()) return true;
        return deleteRecursive(vDir);
    }

    private boolean deleteRecursive(File file) {
        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) {
                for (File child : children) {
                    deleteRecursive(child);
                }
            }
        }
        return file.delete();
    }
}
