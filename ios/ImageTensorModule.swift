import Foundation
import UIKit

@objc(ImageTensorModule)
class ImageTensorModule: NSObject {

  @objc
  static func requiresMainQueueSetup() -> Bool {
    return false
  }

  // MARK: - imageToTensor

  @objc
  func imageToTensor(
    _ uri: String,
    width: Double,
    height: Double,
    mean: [Double],
    std: [Double],
    scale: Double,
    channelOrder: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.global(qos: .userInitiated).async {
      guard let image = Self.loadImage(from: uri) else {
        reject("IMAGE_ERROR", "Could not load image: \(uri)", nil)
        return
      }

      let targetW = Int(width)
      let targetH = Int(height)

      guard let resized = Self.resizeImage(image, to: CGSize(width: targetW, height: targetH)),
            let cgImage = resized.cgImage else {
        reject("IMAGE_ERROR", "Failed to resize image", nil)
        return
      }

      guard let output = Self.extractNchw(
        from: cgImage,
        width: targetW,
        height: targetH,
        mean: mean,
        std: std,
        scale: scale,
        bgr: channelOrder.uppercased() == "BGR"
      ) else {
        reject("IMAGE_ERROR", "Failed to extract pixel data", nil)
        return
      }

      resolve(output)
    }
  }

  // MARK: - cropImage

  @objc
  func cropImage(
    _ uri: String,
    x: Double,
    y: Double,
    width: Double,
    height: Double,
    outputPath: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.global(qos: .userInitiated).async {
      guard let image = Self.loadImage(from: uri), let cgImage = image.cgImage else {
        reject("IMAGE_ERROR", "Could not load image: \(uri)", nil)
        return
      }

      let imgW = Double(cgImage.width)
      let imgH = Double(cgImage.height)

      let px = max(0, min(x * imgW, imgW - 1))
      let py = max(0, min(y * imgH, imgH - 1))
      let pw = max(1, min(width * imgW, imgW - px))
      let ph = max(1, min(height * imgH, imgH - py))

      let cropRect = CGRect(x: px, y: py, width: pw, height: ph)

      guard let cropped = cgImage.cropping(to: cropRect) else {
        reject("IMAGE_ERROR", "Failed to crop image", nil)
        return
      }

      let croppedImage = UIImage(cgImage: cropped)
      guard let jpegData = croppedImage.jpegData(compressionQuality: 0.95) else {
        reject("IMAGE_ERROR", "Failed to encode cropped image as JPEG", nil)
        return
      }

      let outputURL = URL(fileURLWithPath: outputPath)
      let parentDir = outputURL.deletingLastPathComponent()

      do {
        try FileManager.default.createDirectory(
          at: parentDir,
          withIntermediateDirectories: true
        )
        try jpegData.write(to: outputURL)
        resolve(outputPath)
      } catch {
        reject("IMAGE_ERROR", "Failed to save cropped image: \(error.localizedDescription)", error)
      }
    }
  }

  // MARK: - Helpers (internal for testing)

  static func loadImage(from uri: String) -> UIImage? {
    // Strip file:// scheme
    var path = uri
    if path.hasPrefix("file://") {
      path = String(path.dropFirst(7))
    }

    // Try as file path first
    if FileManager.default.fileExists(atPath: path) {
      return UIImage(contentsOfFile: path)
    }

    // Try as URL
    if let url = URL(string: uri), let data = try? Data(contentsOf: url) {
      return UIImage(data: data)
    }

    return nil
  }

  static func resizeImage(_ image: UIImage, to size: CGSize) -> UIImage? {
    let renderer = UIGraphicsImageRenderer(size: size)
    return renderer.image { _ in
      image.draw(in: CGRect(origin: .zero, size: size))
    }
  }

  static func extractNchw(
    from cgImage: CGImage,
    width w: Int,
    height h: Int,
    mean: [Double],
    std: [Double],
    scale: Double,
    bgr: Bool
  ) -> [Double]? {
    let bytesPerPixel = 4
    let bytesPerRow = bytesPerPixel * w
    let bitsPerComponent = 8

    var pixelData = [UInt8](repeating: 0, count: h * bytesPerRow)

    guard let colorSpace = CGColorSpace(name: CGColorSpace.sRGB),
          let context = CGContext(
            data: &pixelData,
            width: w,
            height: h,
            bitsPerComponent: bitsPerComponent,
            bytesPerRow: bytesPerRow,
            space: colorSpace,
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
          ) else {
      return nil
    }

    context.draw(cgImage, in: CGRect(x: 0, y: 0, width: w, height: h))

    // RGBA byte layout → NCHW double array
    var output = [Double](repeating: 0.0, count: 3 * h * w)

    let rIdx = bgr ? 2 : 0
    let gIdx = 1
    let bIdx = bgr ? 0 : 2

    for row in 0..<h {
      for col in 0..<w {
        let pixelOffset = row * bytesPerRow + col * bytesPerPixel
        let r = Double(pixelData[pixelOffset])
        let g = Double(pixelData[pixelOffset + 1])
        let b = Double(pixelData[pixelOffset + 2])

        let i = row * w + col
        output[rIdx * h * w + i] = (r / scale - mean[0]) / std[0]
        output[gIdx * h * w + i] = (g / scale - mean[1]) / std[1]
        output[bIdx * h * w + i] = (b / scale - mean[2]) / std[2]
      }
    }

    return output
  }
}
