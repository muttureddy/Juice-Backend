const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { Readable } = require('stream');

// ── Configure Cloudinary ────────────────────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const isCloudinaryConfigured = () =>
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_CLOUD_NAME !== 'your_cloud_name';

// ── Multer: store file in memory (buffer), no disk writes ───────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed (jpg, png, webp).'), false);
  },
});

/**
 * uploadToCloudinary(buffer, options)
 * Uploads a Buffer to Cloudinary using the upload_stream API.
 * Returns { url, publicId } or throws.
 */
function uploadToCloudinary(buffer, options = {}) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder:          'freshly/products',
        transformation:  [{ width: 800, height: 600, crop: 'fill', quality: 'auto:good' }],
        ...options,
      },
      (error, result) => {
        if (error) return reject(error);
        resolve({ url: result.secure_url, publicId: result.public_id });
      }
    );
    // Pipe the buffer into the upload stream
    Readable.from(buffer).pipe(stream);
  });
}

/**
 * deleteFromCloudinary(publicId)
 * Removes an image from Cloudinary. Non-fatal — errors are swallowed.
 */
async function deleteFromCloudinary(publicId) {
  try {
    if (publicId && isCloudinaryConfigured()) {
      await cloudinary.uploader.destroy(publicId);
    }
  } catch (err) {
    console.warn('⚠️  Cloudinary delete warning:', err.message);
  }
}

module.exports = { upload, uploadToCloudinary, deleteFromCloudinary, isCloudinaryConfigured };
