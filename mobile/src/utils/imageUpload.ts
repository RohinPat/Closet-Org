import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

export type UploadableImage = {
  uri: string;
  filename: string;
  mimeType: string;
};

const MAX_UPLOAD_DIMENSION = 1600;

function inferMime(asset: ImagePicker.ImagePickerAsset): string {
  const lower = `${asset.fileName ?? ''} ${asset.uri}`.toLowerCase();
  if (lower.includes('.png')) return 'image/png';
  if (lower.includes('.webp')) return 'image/webp';
  if (lower.includes('.heic') || lower.includes('.heif')) return 'image/heic';
  return asset.mimeType || 'image/jpeg';
}

function resizeAction(asset: ImagePicker.ImagePickerAsset): ImageManipulator.Action[] {
  const { width, height } = asset;
  if (!width || !height) return [];
  const longest = Math.max(width, height);
  if (longest <= MAX_UPLOAD_DIMENSION) return [];
  if (width >= height) return [{ resize: { width: MAX_UPLOAD_DIMENSION } }];
  return [{ resize: { height: MAX_UPLOAD_DIMENSION } }];
}

export async function imagePickerAssetToUpload(
  asset: ImagePicker.ImagePickerAsset,
  prefix = 'upload'
): Promise<UploadableImage> {
  const mime = inferMime(asset);

  if (Platform.OS === 'web') {
    const base = asset.fileName ?? asset.uri.split('/').pop()?.split('?')[0];
    return {
      uri: asset.uri,
      filename: base && base.includes('.') ? base : `${prefix}.jpg`,
      mimeType: mime === 'image/jpg' ? 'image/jpeg' : mime,
    };
  }

  const converted = await ImageManipulator.manipulateAsync(
    asset.uri,
    resizeAction(asset),
    { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG }
  );

  return {
    uri: converted.uri,
    filename: `${prefix}_${Date.now()}.jpg`,
    mimeType: 'image/jpeg',
  };
}
