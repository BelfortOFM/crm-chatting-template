-- Quatrieme piece KYC : une photo du chatter avec sa piece d'identite tenue
-- a cote du visage, en plus du recto/verso/selfie existants. Le selfie seul
-- confirme qu'une personne vivante a pris la photo ; celle-ci lie cette
-- personne a la piece d'identite deposee par ailleurs (evite qu'un recto/
-- verso vole soit accompagne du selfie d'une autre personne).
alter table identity_verifications
  add column if not exists id_with_face_path text;
