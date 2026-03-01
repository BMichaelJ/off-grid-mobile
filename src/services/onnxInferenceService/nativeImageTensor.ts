import { NativeModules } from 'react-native';

interface ImageTensorModuleInterface {
  imageToTensor(
    uri: string,
    width: number,
    height: number,
    mean: number[],
    std: number[],
    scale: number,
    channelOrder: string,
  ): Promise<number[]>;

  cropImage(
    uri: string,
    x: number,
    y: number,
    width: number,
    height: number,
    outputPath: string,
  ): Promise<string>;
}

export const ImageTensorModule =
  NativeModules.ImageTensorModule as ImageTensorModuleInterface;
