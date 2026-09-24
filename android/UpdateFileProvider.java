package com.wayne.componenthub;

import androidx.core.content.FileProvider;

/** Standard URI sharing, restricted to the dedicated update directory. */
public final class UpdateFileProvider extends FileProvider {
    public UpdateFileProvider() { super(); }
}
