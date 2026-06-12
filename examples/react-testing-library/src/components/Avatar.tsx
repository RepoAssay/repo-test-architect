interface AvatarProps {
  name: string;
  imageUrl: string;
}

export function Avatar({ name, imageUrl }: AvatarProps) {
  return <img alt={name} src={imageUrl} />;
}
